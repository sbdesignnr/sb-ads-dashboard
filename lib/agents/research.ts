// Beh výskumného agenta (Nora) v appke: zaradenie behu, vykonanie na pozadí, uloženie
// overeného briefu a "Použiť ako koncept". Samotný agent je v lib/leads/research/.
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent, writeOutreachEmail, type AgentResult, type Finding, type OfferPlan } from "@/lib/leads/research/strategist";
import type { MailCraft } from "@/lib/leads/research/mailcraft";
import type { Council, ScoutNote } from "@/lib/leads/research/council";
import { isEditedByHand } from "@/lib/leads/draft-state";
import { getBudget, withSpend } from "@/lib/agents/budget";
import { executeMockup, publicMockupUrl, startMockup } from "@/lib/agents/mockup";

/** Beh, ktorý sa neozval dlhšie, sa považuje za spadnutý (funkcia mohla skončiť časovým limitom). */
export const STALE_MS = 14 * 60_000;

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
  /** hotový návrh domovskej stránky k tomuto výskumu */
  mockup?: { id: string; url: string } | null;
  /** ako mail vznikol (uhly, simulovaný adresát) */
  craft?: MailCraft | null;
  /** porada agentov a jej rozhodnutie */
  council?: Council | null;
  /** poznámka Skauta (Miro), prečo bol lead vybraný */
  scout?: ScoutNote | null;
}

/** Zmenší výsledok agenta na to, čo sa oplatí uložiť a ukázať (dôkazy skrátené). */
export function toBrief(r: AgentResult, mockup?: { id: string; url: string } | null, scout?: ScoutNote | null): ResearchBrief {
  return {
    mockup: mockup ?? null,
    craft: r.craft ?? null,
    council: r.council ?? null,
    scout: scout ?? null,
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

  // Tvrdý strop: ani ručný beh sa nespustí, keď je mesačný rozpočet vyčerpaný.
  const budget = await getBudget();
  if (budget.available && budget.spentEur >= budget.capEur)
    return {
      ok: false,
      status: 402,
      error: `Mesačný rozpočet ${budget.capEur} € je vyčerpaný. Zvýš ho (AGENT_MONTHLY_BUDGET_EUR) alebo počkaj na nový mesiac.`,
    };

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
export interface ResearchOptions {
  /** vyrobiť aj hotový návrh domovskej stránky (Ateliér) a poslať ho v maile; predvolene VYPNUTÉ (drahé, ponuka sa neposiela vopred) */
  withMockup?: boolean;
  /** prémiový návrh (koncept od Opusa) */
  director?: boolean;
  /** poznámka Skauta (Miro) pre Noru */
  scoutNote?: ScoutNote | null;
  /** hlboký režim: porada Miro + Nora pred písaním mailu (≈ +0,03 €); varianty mailu sa robia vždy */
  deep?: boolean;
}

export async function executeResearch(researchId: string, leadId: string, opts: ResearchOptions = {}): Promise<void> {
  return withSpend({ agent: "nora", ref: leadId }, () => executeResearchInner(researchId, leadId, opts));
}

async function executeResearchInner(researchId: string, leadId: string, opts: ResearchOptions): Promise<void> {
  const setStep = (step: string) =>
    prisma.leadResearch.update({ where: { id: researchId }, data: { step: step.slice(0, 200) } }).catch(() => {});
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { segment: { select: { name: true, keywords: true } } },
    });
    if (!lead) throw new Error("Lead zmizol.");
    let pending: Promise<unknown> = Promise.resolve();
    let mockup: { id: string; url: string } | null = null;
    const result = await runResearchAgent({
      lead,
      segmentName: lead.segment?.name ?? "firma",
      keywords: lead.segment?.keywords ?? [],
      onStep: (m) => {
        pending = pending.then(() => setStep(m));
      },
      scoutNote: opts.scoutNote ?? null,
      deep: Boolean(opts.deep),
      beforeEmail: opts.withMockup
        ? async ({ findings, offer, pack }) => {
            const started = await startMockup(leadId, { researchId });
            if (!started.ok) return null;
            const findingsText =
              findings.map((f) => `- ${f.claim}`).join("\n") + `\nNAVRHNUTÁ PONUKA: ${offer.name}. ${offer.deliverable}`;
            // Ateliér má vlastný kontext výdavkov (agent "atelier")
            const r = await withSpend({ agent: "atelier", ref: leadId }, () =>
              executeMockup(started.id, { pack, findingsText, director: opts.director }),
            );
            if (!r.ok || !r.token) return null;
            mockup = { id: started.id, url: publicMockupUrl(r.token) };
            return { url: mockup.url };
          }
        : undefined,
    });
    await pending;
    const ok = Boolean(result.offer) && result.findings.length >= 2;
    // Nora sama posúdila, že firma nepatrí do odboru / nie je vhodná: lead sa vyradí (dá sa vrátiť
    // v záložke "Skryté"), aby ho Skaut nevyberal znova.
    if (result.skipReason) {
      await prisma.lead
        .update({ where: { id: leadId }, data: { status: "rejected", disqualifyReason: `Nora: ${result.skipReason}`.slice(0, 500) } })
        .catch(() => {});
    }
    await prisma.leadResearch.update({
      where: { id: researchId },
      data: {
        status: ok ? "done" : "failed",
        step: null,
        brief: toBrief(result, mockup, opts.scoutNote ?? null) as object,
        emailSubject: result.email?.subject ?? null,
        emailBody: result.email?.body ?? null,
        offerName: result.offer?.name ?? null,
        costEur: result.usage.estimatedEur,
        error: ok
          ? result.email
            ? null
            : "Ponuka je hotová, ale mail neprešiel kontrolou kvality."
          : result.skipReason
            ? `Vyradené: ${result.skipReason}`
            : "Nepodarilo sa zostaviť aspoň 2 overené zistenia a ponuku.",
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


export type RewriteResult = { ok: true; subject: string; body: string } | { ok: false; status: number; error: string };

/**
 * Napíše mail znova z uložených overených zistení a ponuky. Používa sa po vyrobení návrhu
 * domovskej stránky: mail potom ukazuje hotovú vec (s odkazom), nie sľub.
 */
export async function rewriteEmailWithMockup(researchId: string, mockupId?: string): Promise<RewriteResult> {
  const r = await prisma.leadResearch.findUnique({ where: { id: researchId }, include: { lead: true } });
  if (!r || !r.brief) return { ok: false, status: 404, error: "Výskum sa nenašiel." };
  const brief = r.brief as unknown as ResearchBrief;
  if (!brief.offer || brief.findings.length < 2) return { ok: false, status: 422, error: "Výskum nemá dosť overených zistení." };
  const mockup = await prisma.leadMockup.findFirst({
    where: { leadId: r.leadId, status: "done", ...(mockupId ? { id: mockupId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true },
  });
  if (!mockup) return { ok: false, status: 422, error: "Lead nemá hotový návrh domovskej stránky." };
  const url = publicMockupUrl(mockup.token);
  const findings: Finding[] = brief.findings.map((f) => ({
    id: f.id,
    claim: f.claim,
    why_it_matters: f.why,
    evidence: f.evidence.map((e) => ({ eid: e.eid, quote: e.quote, ok: true })),
    verified: true,
    audit: f.audit,
    auditNote: f.auditNote,
  }));
  const segment = await prisma.leadSegment.findFirst({ where: { leads: { some: { id: r.leadId } } }, select: { name: true } });
  const written = await withSpend({ agent: "nora", ref: r.leadId }, () =>
    writeOutreachEmail({
      client: new Anthropic(),
      lead: r.lead,
      segmentName: segment?.name ?? "firma",
      findings,
      offer: brief.offer!,
      evidence: brief.evidence,
      mockupUrl: url,
    }),
  );
  if (!written.email) return { ok: false, status: 422, error: `Mail neprešiel kontrolou kvality (${written.issues.slice(-1)[0] ?? "?"}). Skús znova.` };
  await prisma.leadResearch.update({
    where: { id: researchId },
    data: {
      emailSubject: written.email.subject,
      emailBody: written.email.body,
      appliedAt: null,
      brief: { ...brief, mockup: { id: mockup.id, url }, craft: written.craft ?? brief.craft ?? null } as unknown as object,
    },
  });
  return { ok: true, subject: written.email.subject, body: written.email.body };
}
