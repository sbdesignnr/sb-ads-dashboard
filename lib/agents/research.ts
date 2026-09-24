// Beh výskumného agenta (Nora) v appke: zaradenie behu, vykonanie na pozadí, uloženie
// overeného briefu a "Použiť ako koncept". Samotný agent je v lib/leads/research/.
import { prisma } from "@/lib/prisma";
import { runResearchAgent, type AgentResult, type OfferPlan } from "@/lib/leads/research/strategist";
import { isEditedByHand } from "@/lib/leads/draft-state";

/** Beh, ktorý sa neozval dlhšie, sa považuje za spadnutý (funkcia mohla skončiť časovým limitom). */
export const STALE_MS = 8 * 60_000;

export interface BriefFinding {
  id: string;
  claim: string;
  why: string;
  audit: "ok" | "partial" | "unsupported";
  auditNote?: string;
  evidence: { eid: string; quote: string }[];
}

export interface ResearchBrief {
  understanding: string;
  nicheNotes: string;
  findings: BriefFinding[];
  dropped: { id: string; claim: string; reason: string }[];
  offer: OfferPlan | null;
  evidence: { id: string; kind: string; title: string; source: string; text: string }[];
  notes: string[];
  issues: string[];
  skipReason: string | null;
  usageEur: number;
}

/** Zmenší výsledok agenta na to, čo sa oplatí uložiť a ukázať (dôkazy skrátené). */
export function toBrief(r: AgentResult): ResearchBrief {
  return {
    understanding: r.understanding,
    nicheNotes: r.nicheNotes,
    findings: r.findings.map((f) => ({
      id: f.id,
      claim: f.claim,
      why: f.why_it_matters,
      audit: f.audit ?? "ok",
      auditNote: f.auditNote,
      evidence: f.evidence.map((e) => ({ eid: e.eid, quote: e.quote })),
    })),
    dropped: r.dropped.map((f) => ({
      id: f.id,
      claim: f.claim,
      reason:
        f.audit === "unsupported"
          ? `Kontrola faktov: ${f.auditNote ?? "dôkazy tvrdenie nepotvrdzujú"}`
          : "Citát sa v zdroji nenašiel",
    })),
    offer: r.offer,
    evidence: r.pack.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      source: i.source,
      text: i.text.slice(0, 2400),
    })),
    notes: r.pack.notes,
    issues: r.issues,
    skipReason: r.skipReason,
    usageEur: r.usage.estimatedEur,
  };
}

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/** Založí beh (alebo odmietne, ak Nora už pracuje / lead nie je vhodný). */
export async function startResearch(leadId: string): Promise<StartResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, websiteUrl: true, companyName: true },
  });
  if (!lead) return { ok: false, status: 404, error: "Lead sa nenašiel." };
  if (!lead.websiteUrl)
    return { ok: false, status: 422, error: "Lead nemá web, agent nemá z čoho vychádzať." };

  const cutoff = new Date(Date.now() - STALE_MS);
  await prisma.leadResearch.updateMany({
    where: { status: "running", updatedAt: { lt: cutoff } },
    data: { status: "failed", error: "Beh sa neukončil včas (pravdepodobne časový limit)." },
  });
  const busy = await prisma.leadResearch.findFirst({
    where: { status: "running" },
    select: { lead: { select: { companyName: true } } },
  });
  if (busy)
    return {
      ok: false,
      status: 409,
      error: `Nora ešte pracuje na ponuke pre ${busy.lead.companyName}. Počkaj, kým skončí.`,
    };

  const row = await prisma.leadResearch.create({
    data: { leadId, status: "running", step: "Zaraďujem do práce…" },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** Vykoná beh (1–2 min). Volá sa na pozadí (after()) — chyby sa zapisujú do záznamu. */
export async function executeResearch(researchId: string, leadId: string): Promise<void> {
  const setStep = (step: string) =>
    prisma.leadResearch.update({ where: { id: researchId }, data: { step: step.slice(0, 200) } }).catch(() => {});
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { segment: { select: { name: true, keywords: true } } },
    });
    if (!lead) throw new Error("Lead zmizol.");
    let pending: Promise<unknown> = Promise.resolve();
    const result = await runResearchAgent({
      lead,
      segmentName: lead.segment?.name ?? "firma",
      keywords: lead.segment?.keywords ?? [],
      onStep: (m) => {
        pending = pending.then(() => setStep(m));
      },
    });
    await pending;
    const ok = Boolean(result.offer) && result.findings.length >= 2;
    await prisma.leadResearch.update({
      where: { id: researchId },
      data: {
        status: ok ? "done" : "failed",
        step: null,
        brief: toBrief(result) as object,
        emailSubject: result.email?.subject ?? null,
        emailBody: result.email?.body ?? null,
        offerName: result.offer?.name ?? null,
        costEur: result.usage.estimatedEur,
        error: ok
          ? result.email
            ? null
            : "Ponuka je hotová, ale mail neprešiel kontrolou kvality."
          : (result.skipReason ?? "Nepodarilo sa zostaviť aspoň 2 overené zistenia a ponuku."),
      },
    });
  } catch (e) {
    await prisma.leadResearch
      .update({
        where: { id: researchId },
        data: { status: "failed", step: null, error: (e as Error).message.slice(0, 400) },
      })
      .catch(() => {});
  }
}

export type ApplyResult =
  | { ok: true; emailId: string; replaced: boolean }
  | { ok: false; status: number; error: string; code?: "edited" };

/** Mail z výskumu sa stane konceptom (initial) — na schválenie ide bežnou cestou v kampaniach. */
export async function applyResearchEmail(researchId: string, force: boolean): Promise<ApplyResult> {
  const r = await prisma.leadResearch.findUnique({ where: { id: researchId } });
  if (!r) return { ok: false, status: 404, error: "Záznam sa nenašiel." };
  if (!r.emailSubject || !r.emailBody)
    return { ok: false, status: 422, error: "Výskum nemá hotový mail." };

  const existing = await prisma.leadEmail.findFirst({
    where: { leadId: r.leadId, emailType: "initial" },
    orderBy: { createdAt: "asc" },
  });
  if (existing && existing.status !== "draft")
    return {
      ok: false,
      status: 409,
      error: "Lead už má schválený alebo odoslaný úvodný mail, ten sa neprepisuje.",
    };
  if (existing && isEditedByHand(existing) && !force)
    return {
      ok: false,
      status: 409,
      code: "edited",
      error: "Existujúci koncept si ručne upravil. Prepísať ho?",
    };

  let emailId: string;
  if (existing) {
    // createdAt sa nastaví na "teraz", aby nový koncept nevyzeral ako ručne upravený
    const upd = await prisma.leadEmail.update({
      where: { id: existing.id },
      data: { subject: r.emailSubject, body: r.emailBody, createdAt: new Date() },
      select: { id: true },
    });
    emailId = upd.id;
  } else {
    const created = await prisma.leadEmail.create({
      data: { leadId: r.leadId, subject: r.emailSubject, body: r.emailBody, emailType: "initial", status: "draft" },
      select: { id: true },
    });
    emailId = created.id;
  }
  await prisma.leadResearch.update({ where: { id: researchId }, data: { appliedAt: new Date() } });
  return { ok: true, emailId, replaced: Boolean(existing) };
}
