// Skaut (Miro): lacný predfilter príležitostí. Deterministické skóre (skaut.ts) vyberie
// kandidátov, Haiku ich za zlomok centa posúdi ako skúsený obchodník: je to skutočná malá firma
// z cieľového odboru, ktorú sa oplatí osloviť? Zlé zásahy (koncerny, inštitúcie, iný odbor,
// pokazené názvy) tak nespália ~0,1 € na výskum Nory.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "@/lib/leads/ai";
import type { OpportunityLead } from "./skaut";

export const TRIAGE_MODEL = process.env.AGENT_TRIAGE_MODEL?.trim() || "claude-haiku-4-5-20251001";
/** Od tohto skóre sa lead pustí k Nore. */
export const FIT_MIN = 6;

export interface TriageInput extends OpportunityLead {
  aiSummary: string | null;
  aiPainPoint: string | null;
  aiOpportunity: string | null;
  websiteTechnology: string | null;
  websiteIssues: string[];
  visualIssues: string[];
  industry: string | null;
  ownerName: string | null;
}

export interface Triage {
  fit: number;
  size: "solo" | "small" | "mid" | "large" | "chain" | "institution" | "unknown";
  nicheOk: boolean;
  redFlags: string[];
  hint: string;
  reason: string;
}

const SYSTEM = `Si Miro, skúsený obchodný skaut pre SB Design (Samuel Bibeň, Nitra: weby na mieru pre malé a stredné firmy). Z dát o firmách rozhodneš, ktoré sa oplatí osloviť s ponukou novej domovskej stránky.

CIEĽOVÉ ODBORY (všetky tri sú rovnocenné a prioritné): realitné kancelárie, stavebné firmy a remeselníci, fyzioterapia a zdravotné služby. Trh je Slovensko AJ Česko (segmenty „SK+CZ“), česká firma je v poriadku. NIKDY nehodnoť odbor ako celok, hodnoť KONKRÉTNU firmu.
IDEÁLNY CIEĽ: malá firma (1 až 25 ľudí), rozhoduje majiteľ, jej biznis stojí na dôvere a ukážke práce, má slabý alebo zastaraný web, ktorý jej reálne škodí.
NEVHODNÉ: koncerny a siete pobočiek, franšízy, verejné inštitúcie a školy, e-shopy a veľkoobchod, firmy, ktoré podľa dát NEPATRIA do uvedeného odboru (napr. stomatológ v „fyzioterapii“, predaj alebo poradenstvo v „stavebných“), firmy bez zjavného vlastného biznisu, poškodené alebo podozrivé záznamy (rozbité znaky v názve, telefónne číslo namiesto názvu), agentúry a akadémie, ktoré samy robia weby alebo školenia, B2B dodávatelia bez priameho zákazníka.

Pre KAŽDÚ firmu vráť: fit 0-10 (10 = dokonalý cieľ; pod 6 sa neoslovuje), size (solo|small|mid|large|chain|institution|unknown), niche_ok (firma podľa dát naozaj patrí do uvedeného odboru; false iba ak je zjavne z iného), red_flags (krátke slová), hint (jedna veta: čím by sa dal osloviť, z dát; nič nevymýšľaj), reason (jedna veta o TEJTO firme, nie o odbore).
Odpovedz VÝHRADNE JSON poľom [{"id","fit","size","niche_ok","red_flags":[],"hint","reason"}] v poradí zadania.`;

const line = (l: TriageInput) =>
  `id=${l.id} | ${l.companyName} | ${l.companyCity ?? "?"} | odbor: ${l.segment?.name ?? l.industry ?? "?"} | web: ${l.websiteUrl} (${l.websiteTechnology ?? "?"}, skóre zastaranosti ${l.websiteScore ?? "?"}, päta ${l.copyrightYear ?? "?"}) | konateľ: ${l.ownerName ?? "neznámy"} | súhrn: ${(l.aiSummary ?? "").slice(0, 260)} | bolesť: ${(l.aiPainPoint ?? "").slice(0, 140)} | problémy: ${[...l.websiteIssues, ...l.visualIssues].slice(0, 4).join("; ").slice(0, 200)}`;

/** Posúdi dávku leadov (1 volanie). Pri chybe vráti prázdnu mapu (výber ide ďalej bez predfiltra). */
export async function triageLeads(leads: TriageInput[]): Promise<Map<string, Triage>> {
  const out = new Map<string, Triage>();
  if (!leads.length) return out;
  try {
    const client = new Anthropic();
    const msg = await createMessage(client, {
      model: TRIAGE_MODEL,
      max_tokens: 400 + leads.length * 170,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: leads.map(line).join("\n") }],
    });
    const m = textFrom(msg).match(/\[[\s\S]*\]/);
    if (!m) return out;
    const rows = JSON.parse(m[0]) as { id?: string; fit?: number; size?: string; niche_ok?: boolean; red_flags?: string[]; hint?: string; reason?: string }[];
    for (const r of rows) {
      if (!r.id || !leads.some((l) => l.id === r.id)) continue;
      out.set(r.id, {
        fit: Math.max(0, Math.min(10, Number(r.fit) || 0)),
        size: (["solo", "small", "mid", "large", "chain", "institution"].includes(String(r.size)) ? r.size : "unknown") as Triage["size"],
        nicheOk: r.niche_ok !== false,
        redFlags: Array.isArray(r.red_flags) ? r.red_flags.map(String).slice(0, 5) : [],
        hint: String(r.hint ?? "").slice(0, 240),
        reason: String(r.reason ?? "").slice(0, 240),
      });
    }
  } catch {
    /* bez predfiltra */
  }
  return out;
}
