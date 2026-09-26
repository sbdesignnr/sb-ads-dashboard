// Nočný režim: Skaut vyberie najlepšie príležitosti a Nora im sama pripraví ponuky.
// Nič sa neodosiela — výsledok čaká v pracovni na posúdenie. Chránia ho tri poistky:
// mesačný rozpočet (fail-closed), denný limit počtu ponúk a vypínač AGENT_NIGHT_DISABLED=1.
import { prisma } from "@/lib/prisma";
import { AGENTS_START, canRunPaced } from "./budget";
import { executeResearch, startResearch } from "./research";
import { anthropicCreditOk, isCreditError } from "./credit";
import { pickWithTriage } from "./skaut";

/** Najviac toľko ponúk denne (5 × 7 = 35 týždenne; cieľ usera je aspoň 30). */
export const DAILY_RESEARCH_CAP = 5;
/** Odhad ceny jedného behu pre kontrolu rozpočtu (základný režim ≈ 0,30 €, hlboký ≈ 0,49 € vrátane Google). */
export const EST_RESEARCH_EUR = 0.35;
/** Namerané ceny jednej ponuky (AI + Google) pre odhad nákladov na týždeň. */
export const OFFER_LEAN_EUR = 0.27;
export const OFFER_DEEP_EUR = 0.49;
/** Denné náklady Mira: plné tempo (2 skeny + posudzovanie) a pokojné (len posudzovanie). */
export const SKAUT_DAY_FULL_EUR = 1.2;
export const SKAUT_DAY_LIGHT_EUR = 0.5;
/** Hlboký režim (porada Miro + Nora, silnejší model pre texty; ≈ +0,2 €) len pre najlepšie leady (fit ≥ 8), najviac toľko týždenne. */
export const DEEP_WEEKLY_CAP = 3;

export interface NightResult {
  ran: { leadId: string; company: string; ok: boolean; error?: string | null }[];
  /** leady, ktoré Miro vyradil ako nevhodné (koncerny, iný odbor…) */
  rejected?: { id: string; company: string; reason: string }[];
  skipped?: string;
  spentEur?: number;
}

export async function runNightQueue(deadlineAt: number, maxRuns = 2): Promise<NightResult> {
  if (process.env.AGENT_NIGHT_DISABLED === "1") return { ran: [], skipped: "Nočný režim je vypnutý (AGENT_NIGHT_DISABLED)." };

  const out: NightResult = { ran: [] };
  if (!(await anthropicCreditOk())) return { ...out, skipped: "Kredit Anthropic je prázdny: dobi ho v Plans & Billing, nočný beh sa potom rozbehne sám." };
  for (let i = 0; i < maxRuns; i++) {
    // ďalší beh sa nezačne, ak by sa už nestihol (jeden trvá 2–3 min)
    if (Date.now() + 240_000 > deadlineAt) {
      out.skipped ??= "Nezostáva dosť času na ďalší beh.";
      break;
    }
    const since = new Date(Math.max(Date.now() - 24 * 3_600_000, AGENTS_START.getTime()));
    // do denného limitu sa nepočítajú behy, ktoré zlyhali len pre prázdny kredit (nič sa nespracovalo)
    const recent = await prisma.leadResearch.findMany({ where: { createdAt: { gte: since } }, select: { status: true, error: true } });
    const today = recent.filter((r) => !(r.status === "failed" && isCreditError(r.error))).length;
    if (today >= DAILY_RESEARCH_CAP) {
      out.skipped ??= `Denný limit ${DAILY_RESEARCH_CAP} ponúk je vyčerpaný.`;
      break;
    }
    const gate = await canRunPaced("nora", EST_RESEARCH_EUR);
    out.spentEur = gate.budget.spentEur;
    if (!gate.ok) {
      out.skipped ??= gate.reason;
      break;
    }
    const { picks, rejected } = await pickWithTriage(1, 6);
    if (rejected.length) out.rejected = [...(out.rejected ?? []), ...rejected];
    const top = picks[0];
    if (!top) {
      if (rejected.length) continue; // Miro vyradil celú dávku, skúsi ďalšiu
      out.skipped ??= "Skaut nemá koho vybrať (zásoba vhodných leadov v prioritných odboroch je prázdna).";
      break;
    }
    const started = await startResearch(top.opportunity.lead.id);
    if (!started.ok) {
      out.skipped ??= started.error;
      break;
    }
    // Návrhy stránok sa v nočnom režime nerobia (drahé a nevieme, či o službu majú záujem).
    // Porada Miro + Nora sa robí len pre najlepšie leady a pod týždenným stropom.
    const deepWeek = await prisma
      .$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM lead_research WHERE status = 'done' AND created_at >= now() - interval '7 days' AND jsonb_typeof(brief->'council') = 'object'`
      .then((r) => r[0]?.n ?? 0)
      .catch(() => DEEP_WEEKLY_CAP);
    const deep = (top.note.fit ?? 0) >= 8 && deepWeek < DEEP_WEEKLY_CAP;
    await executeResearch(started.id, top.opportunity.lead.id, { withMockup: false, deep, scoutNote: top.note });
    const row = await prisma.leadResearch.findUnique({ where: { id: started.id }, select: { status: true, error: true } });
    out.ran.push({ leadId: top.opportunity.lead.id, company: top.opportunity.lead.companyName, ok: row?.status === "done", error: row?.error });
    if (isCreditError(row?.error)) {
      out.skipped ??= "Kredit Anthropic je prázdny: dobi ho v Plans & Billing, zlyhané behy sa zopakujú samy.";
      break;
    }
  }
  return out;
}
