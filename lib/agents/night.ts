// Nočný režim: Skaut vyberie najlepšie príležitosti a Nora im sama pripraví ponuky.
// Nič sa neodosiela — výsledok čaká v pracovni na posúdenie. Chránia ho tri poistky:
// mesačný rozpočet (fail-closed), denný limit počtu ponúk a vypínač AGENT_NIGHT_DISABLED=1.
import { prisma } from "@/lib/prisma";
import { AGENTS_START, canRunAutonomously } from "./budget";
import { executeResearch, startResearch } from "./research";
import { pickWithTriage } from "./skaut";

/** Najviac toľko ponúk denne (5 × 7 = 35 týždenne; cieľ usera je aspoň 30). */
export const DAILY_RESEARCH_CAP = 5;
/** Odhad ceny jedného behu pre kontrolu rozpočtu (AI ≈ 0,15 + Google ≈ 0,06). */
export const EST_RESEARCH_EUR = 0.25;
/** Porada Miro + Nora (≈ +0,03 €) len pre najlepšie leady (fit ≥ 8), najviac toľko týždenne. */
export const DEEP_WEEKLY_CAP = 15;

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
  for (let i = 0; i < maxRuns; i++) {
    // ďalší beh sa nezačne, ak by sa už nestihol (jeden trvá 2–3 min)
    if (Date.now() + 240_000 > deadlineAt) {
      out.skipped ??= "Nezostáva dosť času na ďalší beh.";
      break;
    }
    const since = new Date(Math.max(Date.now() - 24 * 3_600_000, AGENTS_START.getTime()));
    const today = await prisma.leadResearch.count({ where: { createdAt: { gte: since } } });
    if (today >= DAILY_RESEARCH_CAP) {
      out.skipped ??= `Denný limit ${DAILY_RESEARCH_CAP} ponúk je vyčerpaný.`;
      break;
    }
    const gate = await canRunAutonomously("nora", EST_RESEARCH_EUR);
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
  }
  return out;
}
