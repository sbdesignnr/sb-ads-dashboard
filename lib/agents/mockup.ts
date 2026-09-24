// Návrhy domovských stránok v appke: zaradenie behu, vykonanie na pozadí, uloženie a verejný odkaz.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { EvidencePack } from "@/lib/leads/research/collect";
import { buildMockup } from "@/lib/agents/atelier/build";
import { getBudget, withSpend } from "@/lib/agents/budget";

export const MOCKUP_STALE_MS = 8 * 60_000;

export const publicMockupUrl = (token: string) =>
  `${(process.env.NEXT_PUBLIC_APP_URL || "https://ads.sbdesign.sk").replace(/\/$/, "")}/nahlad/${token}`;

export type StartMockup = { ok: true; id: string; token: string } | { ok: false; status: number; error: string };

export async function startMockup(leadId: string, opts: { researchId?: string } = {}): Promise<StartMockup> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, websiteUrl: true } });
  if (!lead) return { ok: false, status: 404, error: "Lead sa nenašiel." };
  if (!lead.websiteUrl) return { ok: false, status: 422, error: "Lead nemá web, nie je z čoho návrh robiť." };
  const budget = await getBudget();
  if (budget.available && budget.spentEur >= budget.capEur)
    return { ok: false, status: 402, error: `Mesačný rozpočet ${budget.capEur} € je vyčerpaný.` };
  await prisma.leadMockup.updateMany({
    where: { status: "running", updatedAt: { lt: new Date(Date.now() - MOCKUP_STALE_MS) } },
    data: { status: "failed", error: "Beh sa neukončil včas." },
  });
  const busy = await prisma.leadMockup.findFirst({ where: { status: "running" }, select: { id: true } });
  if (busy) return { ok: false, status: 409, error: "Ateliér ešte pracuje na inom návrhu. Počkaj, kým skončí." };
  const token = randomBytes(12).toString("hex");
  const row = await prisma.leadMockup.create({
    data: { leadId, researchId: opts.researchId, token, status: "running", step: "Zaraďujem do práce…" },
    select: { id: true },
  });
  return { ok: true, id: row.id, token };
}

/** Vykoná návrh (1–2 min) a uloží výsledok. Chyby sa zapisujú do záznamu. */
export async function executeMockup(
  mockupId: string,
  opts: { director?: boolean; pack?: EvidencePack; findingsText?: string } = {},
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const row = await prisma.leadMockup.findUnique({ where: { id: mockupId }, select: { leadId: true, token: true } });
  if (!row) return { ok: false, error: "Záznam sa nenašiel." };
  const setStep = (step: string) =>
    prisma.leadMockup.update({ where: { id: mockupId }, data: { step: step.slice(0, 200) } }).catch(() => {});
  return withSpend({ agent: "atelier", ref: row.leadId }, async () => {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: row.leadId },
        include: { segment: { select: { name: true, keywords: true } } },
      });
      if (!lead) throw new Error("Lead zmizol.");
      let pending: Promise<unknown> = Promise.resolve();
      const r = await buildMockup({
        lead,
        pack: opts.pack,
        findingsText: opts.findingsText,
        director: opts.director,
        onStep: (m) => {
          pending = pending.then(() => setStep(m));
        },
      });
      await pending;
      await prisma.leadMockup.update({
        where: { id: mockupId },
        data: {
          status: "done",
          step: null,
          html: r.html,
          spec: r.spec as object,
          concept: (r.concept ?? undefined) as object | undefined,
          qa: r.qa as unknown as object,
          heroJpg: new Uint8Array(r.heroJpg),
          fullJpg: new Uint8Array(r.fullJpg),
          costEur: r.costEur,
          error: null,
        },
      });
      return { ok: true, token: row.token };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await prisma.leadMockup
        .update({ where: { id: mockupId }, data: { status: "failed", step: null, error: msg } })
        .catch(() => {});
      return { ok: false, error: msg };
    }
  });
}
