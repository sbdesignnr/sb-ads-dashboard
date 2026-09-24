// Nočný režim: Skaut vyberie najlepšie príležitosti a Nora im sama pripraví ponuky.
// Nič sa neodosiela — výsledok čaká v pracovni na posúdenie. Chránia ho tri poistky:
// mesačný rozpočet (fail-closed), denný limit počtu ponúk a vypínač AGENT_NIGHT_DISABLED=1.
import { prisma } from "@/lib/prisma";
import { canRunAutonomously } from "./budget";
import { executeResearch, startResearch } from "./research";
import { getShortlist } from "./skaut";

/** Najviac toľko ponúk denne (5 × 7 = 35 týždenne; cieľ usera je aspoň 30). */
export const DAILY_RESEARCH_CAP = 5;
/** Odhad ceny jedného behu pre kontrolu rozpočtu (AI ≈ 0,13 + Google ≈ 0,06). */
export const EST_RESEARCH_EUR = 0.2;
/** Najviac toľko hotových návrhov stránok týždenne v nočnom režime (≈ 40 mesačne). */
export const WEEKLY_MOCKUP_CAP = 10;

export interface NightResult {
  ran: { leadId: string; company: string; ok: boolean; error?: string | null }[];
  skipped?: string;
  spentEur?: number;
}

export async function runNightQueue(deadlineAt: number, maxRuns = 2): Promise<NightResult> {
  if (process.env.AGENT_NIGHT_DISABLED === "1") return { ran: [], skipped: "Nočný režim je vypnutý (AGENT_NIGHT_DISABLED)." };

  const out: NightResult = { ran: [] };
  for (let i = 0; i < maxRuns; i++) {
    // ďalší beh sa nezačne, ak by sa už nestihol (jeden trvá 1–2 min)
    if (Date.now() + 130_000 > deadlineAt) {
      out.skipped ??= "Nezostáva dosť času na ďalší beh.";
      break;
    }
    const since = new Date(Date.now() - 24 * 3_600_000);
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
    const { picks } = await getShortlist(1);
    const top = picks[0];
    if (!top) {
      out.skipped ??= "Skaut nemá koho vybrať (zásoba vhodných leadov v prioritných odboroch je prázdna).";
      break;
    }
    const started = await startResearch(top.lead.id);
    if (!started.ok) {
      out.skipped ??= started.error;
      break;
    }
    // Návrh domovskej stránky (Ateliér) len pre obmedzený počet leadov týždenne (rozpočet).
    const weekMockups = await prisma.leadMockup.count({ where: { status: "done", createdAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) } } }).catch(() => WEEKLY_MOCKUP_CAP);
    await executeResearch(started.id, top.lead.id, { withMockup: weekMockups < WEEKLY_MOCKUP_CAP });
    const row = await prisma.leadResearch.findUnique({ where: { id: started.id }, select: { status: true, error: true } });
    out.ran.push({ leadId: top.lead.id, company: top.lead.companyName, ok: row?.status === "done", error: row?.error });
  }
  return out;
}
