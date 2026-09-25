// Nora: remeslo písania cold mailu. (1) plán: kto číta, v akom je stave, aké 3 rôzne uhly sa
// ponúkajú a akú námietku zmierniť; (2) simulácia adresáta: model v koži majiteľa firmy
// ohodnotí varianty ako v doručenej pošte a vyberie ten, ktorý by ho reálne presvedčil.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../ai";
import { ANGLES, nicheCard, SALES_PRINCIPLES } from "./playbook";
import type { Finding, OfferPlan } from "./strategist";

const MODEL = () => process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5";

export interface MailAngleBrief {
  angle: string;
  finding_id: string;
  opening: string;
  objection: string;
  defusal: string;
  subject_idea: string;
}

export interface MailPlan {
  recipient: string;
  angles: MailAngleBrief[];
}

export interface VariantScore {
  open: number;
  reply: number;
  trust: number;
  aiSmell: number;
  stopsAt: string;
  edit: string;
  total: number;
}

/** Stručný záznam o variante mailu, ktorý sa ukladá do briefu ("prečo takto"). */
export interface MailVariantNote {
  angle: string;
  subject: string;
  preview: string;
  lintErrors: string[];
  score: VariantScore | null;
  chosen: boolean;
}

export interface MailCraft {
  recipient: string;
  variants: MailVariantNote[];
  verdict: string;
}

const PLAN_TOOL: Anthropic.Tool = {
  name: "uloz_plan",
  description: "Uloží plán mailu: adresát a tri rôzne uhly.",
  input_schema: {
    type: "object",
    properties: {
      recipient: { type: "string", description: "2 vety: kto to číta, v akom je stave a čo ho v jeho práci trápi (z karty odboru a zistení)." },
      angles: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            angle: { type: "string", description: "id uhla zo zoznamu" },
            finding_id: { type: "string", description: "id zistenia (F1…), o ktoré sa uhol opiera" },
            opening: { type: "string", description: "obsah prvej vety (nie hotová veta)" },
            objection: { type: "string", description: "najpravdepodobnejšia námietka adresáta pri tomto uhle" },
            defusal: { type: "string", description: "jedna vecná veta, ktorá námietku zmierni (bez vymyslených faktov)" },
            subject_idea: { type: "string", description: "inšpirácia pre predmet, 2-4 slová" },
          },
          required: ["angle", "finding_id", "opening", "objection", "defusal", "subject_idea"],
        },
      },
    },
    required: ["recipient", "angles"],
  } as Anthropic.Tool.InputSchema,
};

const PLAN_SYSTEM = `Si predajný stratég a psychológ pre SB Design (Samuel Bibeň, Nitra: weby na mieru). Pripravuješ prvý kontaktný mail majiteľovi malej firmy. NEPÍŠEŠ mail; navrhneš plán: kto ho číta a TRI RÔZNE uhly, z ktorých sa napíšu tri varianty (potom ich posúdi simulovaný adresát).

${SALES_PRINCIPLES}

PRAVIDLÁ PLÁNU
- Tri uhly MUSIA byť rôzne (rôzne id) a pokiaľ sa dá, opierať sa o rôzne overené zistenia. Uhol smie byť použitý iba ak preň existuje overené zistenie; uhol „hotova-vec“ iba ak už hotový návrh existuje.
- "opening" popisuje OBSAH prvej vety (konkrétny fakt o nich z overeného zistenia), nie hotovú vetu.
- "defusal" je jedna vecná veta pre najpravdepodobnejšiu námietku pri tomto uhle; nesmie tvrdiť nič, čo nie je v ponuke alebo zisteniach.
- Nič nevymýšľaj; fakty o firme sú iba overené zistenia.
Výsledok vlož VÝHRADNE cez nástroj "uloz_plan".`;

export async function planMail(
  client: Anthropic,
  input: { companyName: string; city: string | null; segmentName: string; findings: Finding[]; offer: OfferPlan; mockupReady: boolean; guidance?: string },
): Promise<MailPlan | null> {
  const niche = nicheCard(input.segmentName);
  const facts = input.findings.map((f) => `${f.id}: ${f.claim} (dôkaz: „${f.evidence[0]?.quote ?? ""}“)`).join("\n");
  const angles = ANGLES.filter((a) => input.mockupReady || a.id !== "hotova-vec").map((a) => `- ${a.id}: ${a.label}. ${a.how}`).join("\n");
  try {
    const msg = await createMessage(client, {
      model: MODEL(),
      max_tokens: 1400,
      temperature: 0.6,
      system: PLAN_SYSTEM,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "uloz_plan" },
      messages: [
        {
          role: "user",
          content: `FIRMA: ${input.companyName} (${input.city ?? "?"}), odvetvie: ${input.segmentName}\n\nKARTA ODBORU (${niche.name}):\n${niche.card}\n\nOVERENÉ ZISTENIA:\n${facts}\n\nPONUKA: ${input.offer.name}. ${input.offer.deliverable}\nHotový návrh domovskej stránky: ${input.mockupReady ? "ÁNO (odkaz pridá systém pod mail)" : "nie"}\n\nDOSTUPNÉ UHLY:\n${angles}${input.guidance ? `\n\nROZHODNUTIE PORADY AGENTOV (zohľadni; preferovaný uhol zaraď medzi tri, ak preň existuje overené zistenie):\n${input.guidance}` : ""}`,
        },
      ],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const d = (block?.input ?? {}) as Partial<MailPlan>;
    const okIds = new Set(input.findings.map((f) => f.id));
    const list = (Array.isArray(d.angles) ? d.angles : [])
      .filter((a) => a && typeof a.angle === "string" && okIds.has(String(a.finding_id)))
      .filter((a) => ANGLES.some((x) => x.id === a.angle))
      .filter((a) => input.mockupReady || a.angle !== "hotova-vec")
      .slice(0, 3);
    // uhly musia byť navzájom rôzne
    const seen = new Set<string>();
    const distinct = list.filter((a) => (seen.has(a.angle) ? false : (seen.add(a.angle), true)));
    if (distinct.length < 2) return null;
    return { recipient: String(d.recipient ?? "").slice(0, 500), angles: distinct };
  } catch {
    return null;
  }
}

export interface DraftForJudge {
  angle: string;
  subject: string;
  body: string;
}

const JUDGE_SYSTEM = `Si simulácia adresáta. Dostaneš popis človeka, ktorý číta poštu, a niekoľko variantov mailu od cudzieho človeka (Samuel, web dizajnér z Nitry). Vieš IBA to, čo je v maile. Číta sa ako v doručenej pošte na mobile: najprv predmet a prvý riadok.

Pre každý variant (podľa poradového čísla) odhadni:
- open: 0-100, či by si mail otvoril (z predmetu a prvého riadku)
- reply: 0-100, či by si odpísal alebo klikol na odkaz
- trust: 0-10, ako veľmi veríš, že ide o skutočného človeka, ktorý sa na teba pozrel
- ai_smell: 0-10, ako veľmi to pôsobí ako hromadný alebo strojovo písaný mail
- stops_at: doslovná fráza, pri ktorej by si prestal čítať (alebo "číta do konca")
- edit: jedna konkrétna zmena TEXTU, ktorá by variant zlepšila (skrátiť, vynechať, prepísať vetu; max 20 slov). Nikdy nenavrhuj prílohy, screenshoty, odkazy ani nové fakty
Buď KRITICKÝ a realistický: väčšina cold mailov skončí v koši, nenadhodnocuj. Nehodnoť podľa dĺžky ani „krásy“ slohu, ale podľa reálneho dojmu, dôvery a toho, či ti mail ponúka niečo, čo chceš vidieť.
Odpovedz VÝHRADNE JSON: {"scores":[{"i":1,"open":0,"reply":0,"trust":0,"ai_smell":0,"stops_at":"…","edit":"…"}],"winner":1,"verdict":"jedna veta, prečo vyhral najlepší variant (opíš ho obsahom, BEZ čísla variantu)"}`;

/** Simulovaný adresát ohodnotí varianty; poradie sa premieša, aby nerozhodovala pozícia. */
export async function judgeMails(
  client: Anthropic,
  recipient: string,
  segmentName: string,
  drafts: DraftForJudge[],
  seed: number,
): Promise<{ scores: (VariantScore | null)[]; winner: number; verdict: string } | null> {
  if (drafts.length < 2) return null;
  const order = drafts.map((_, i) => i);
  // deterministické premiešanie podľa seedu
  let s = seed || 1;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const shown = order.map((idx, n) => `--- VARIANT ${n + 1} ---\nPredmet: ${drafts[idx].subject}\n${drafts[idx].body}`).join("\n\n");
  try {
    const msg = await createMessage(client, {
      model: MODEL(),
      max_tokens: 1400,
      temperature: 0.2,
      system: JUDGE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `ADRESÁT (${segmentName}): ${recipient || "majiteľ malej firmy, vyťažený, číta na mobile"}\n\nVARIANTY:\n${shown}`,
        },
      ],
    });
    const m = textFrom(msg).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as {
      scores?: { i?: number; open?: number; reply?: number; trust?: number; ai_smell?: number; stops_at?: string; edit?: string }[];
      winner?: number;
      verdict?: string;
    };
    const scores: (VariantScore | null)[] = drafts.map(() => null);
    for (const r of j.scores ?? []) {
      const n = Number(r.i) - 1;
      if (!Number.isFinite(n) || n < 0 || n >= order.length) continue;
      const open = clamp(Number(r.open), 0, 100);
      const reply = clamp(Number(r.reply), 0, 100);
      const trust = clamp(Number(r.trust), 0, 10);
      const aiSmell = clamp(Number(r.ai_smell), 0, 10);
      scores[order[n]] = {
        open,
        reply,
        trust,
        aiSmell,
        stopsAt: String(r.stops_at ?? "").slice(0, 160),
        edit: String(r.edit ?? "").slice(0, 200),
        total: 0.25 * open + 0.4 * reply + 2 * trust - 2 * aiSmell,
      };
    }
    let best = -1;
    scores.forEach((sc, i) => {
      if (sc && (best < 0 || sc.total > (scores[best]?.total ?? -1e9))) best = i;
    });
    if (best < 0) return null;
    return { scores, winner: best, verdict: String(j.verdict ?? "").slice(0, 300) };
  } catch {
    return null;
  }
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);
