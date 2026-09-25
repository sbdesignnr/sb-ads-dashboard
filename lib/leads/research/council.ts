// Porada agentov: Miro (skaut) a Nora (stratégia a psychológia predaja) sa nad jedným leadom
// skutočne rozprávajú: každý hovorí zvlášť (samostatné volanie), vidí, čo povedal ten druhý,
// Miro na záver spochybní návrh (čo by majiteľ namietol) a Nora zhrnie rozhodnutie. To ide do
// plánu mailu (dôraz, uhol, námietka). Prepis porady sa ukladá a ukazuje v pracovni.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../ai";
import { ANGLES, nicheCard, SALES_PRINCIPLES } from "./playbook";
import type { Finding, OfferPlan } from "./strategist";

/** Poznámka Skauta pre Noru: prečo tento lead a čím by sa dal osloviť. */
export interface ScoutNote {
  fit: number | null;
  size: string | null;
  reasons: string[];
  hint: string;
  verdict: string;
}

/** "atelier" ostáva v type kvôli starším uloženým poradám (pred vyradením návrhov stránok). */
export type CouncilAgent = "miro" | "nora" | "atelier";

export interface CouncilTurn {
  agent: CouncilAgent;
  text: string;
}

export interface CouncilDecision {
  offerFocus: string;
  /** o ktoré zistenie sa má oprieť prvá veta mailu (F1…) */
  openWith: string | null;
  mailAngle: string | null;
  /** najpravdepodobnejšia námietka majiteľa a jedna vecná veta, ktorá ju zmierni */
  objection: string;
  defusal: string;
  risks: string[];
  /** iba staré porady */
  designDirection?: string;
}

export interface Council {
  turns: CouncilTurn[];
  decision: CouncilDecision;
}

const MODEL = () => process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5";

const PERSONAS: Record<"miro" | "nora", string> = {
  miro: `Si Miro, obchodný skaut štúdia SB Design. Vieš, ako fungujú malé slovenské a české firmy, kto v nich rozhoduje a čo majitelia robia s cudzími mailmi. Hovoríš vecne a stručne. Si skeptický: hľadáš, prečo by majiteľ mail zmazal.`,
  nora: `Si Nora, obchodná stratégička štúdia SB Design a expertka na psychológiu predaja. Vieš, ako sa rozhoduje vyťažený majiteľ malej firmy, čo ho zaujme a čo ho odradí. Navrhuješ, čo presne ponúknuť a akým uhlom to povedať.

${SALES_PRINCIPLES}`,
};

const SHARED = `Porada k jednému leadu: stručná výmena názorov medzi Mirom a Norou o tom, ako tohto majiteľa osloviť jedným mailom. Píš po slovensky, 2 až 4 vety, priamo, bez oslovenia a bez zdvorilostných fráz. Používaj IBA fakty zo zadania (overené zistenia, poznámka skauta); nič nevymýšľaj. Reaguj na predošlé slová, nie na prázdno.
DÔLEŽITÉ: hovoríš IBA za seba, jednou replikou. Nezačínaj svojím menom, nepíš repliky za druhého a nepokračuj v dialógu.
Do mailu sa nepribalí žiadna hotová práca (návrh, prototyp); ponuka je jednoduchá a nič sa nevyrába vopred, kým neodpovedia.`;

const DECISION_TOOL: Anthropic.Tool = {
  name: "uloz_rozhodnutie",
  description: "Uloží rozhodnutie porady.",
  input_schema: {
    type: "object",
    properties: {
      offer_focus: { type: "string", description: "1 veta: na čo sa v ponuke a maile dá dôraz (z overených zistení)." },
      open_with: { type: ["string", "null"], description: "id zistenia (F1…), o ktoré sa má oprieť prvá veta mailu" },
      mail_angle: { type: ["string", "null"], description: `preferovaný uhol mailu: ${ANGLES.filter((a) => a.id !== "hotova-vec").map((a) => a.id).join(" | ")} (alebo null)` },
      objection: { type: "string", description: "najpravdepodobnejšia námietka majiteľa (krátko)" },
      defusal: { type: "string", description: "jedna vecná veta, ktorá námietku zmierni (bez vymyslených faktov)" },
      risks: { type: "array", items: { type: "string" }, maxItems: 3, description: "najväčšie riziká (krátko)" },
    },
    required: ["offer_focus", "open_with", "mail_angle", "objection", "defusal", "risks"],
  } as Anthropic.Tool.InputSchema,
};

/** Model občas dopíše aj repliky druhého ("**Nora:** …"); necháme len hlas hovoriaceho agenta. */
function oneVoice(raw: string): string {
  const names = "Miro|Nora|Ateliér|Atelier|MIRO|NORA|ATELIÉR";
  let t = raw.trim().replace(new RegExp(`^\\**\\s*(?:${names})\\s*:?\\s*\\**\\s*:?\\s*`, "u"), "");
  const cut = t.search(new RegExp(`\\n+\\s*\\**\\s*(?:${names})\\s*\\**\\s*:`, "u"));
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/\*\*/g, "").trim();
}

export async function holdCouncil(
  client: Anthropic,
  ctx: {
    companyName: string;
    city: string | null;
    segmentName: string;
    scout: ScoutNote | null;
    understanding: string;
    findings: Finding[];
    offer: OfferPlan;
  },
): Promise<Council | null> {
  const niche = nicheCard(ctx.segmentName);
  const dossier = [
    `FIRMA: ${ctx.companyName} (${ctx.city ?? "?"}), odvetvie: ${ctx.segmentName}`,
    ctx.scout ? `POZNÁMKA SKAUTA: fit ${ctx.scout.fit ?? "?"}/10, veľkosť ${ctx.scout.size ?? "?"}; ${ctx.scout.verdict} Signály: ${ctx.scout.reasons.join("; ")}. Ako osloviť: ${ctx.scout.hint || "—"}` : "",
    `POCHOPENIE FIRMY: ${ctx.understanding}`,
    `OVERENÉ ZISTENIA:\n${ctx.findings.map((f) => `${f.id}: ${f.claim}`).join("\n")}`,
    `NÁVRH PONUKY: ${ctx.offer.name}. ${ctx.offer.deliverable} (${ctx.offer.why_this})`,
    `KARTA ODBORU (${niche.name}; všeobecná znalosť):\n${niche.card}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const turns: CouncilTurn[] = [];
  const order: { agent: "miro" | "nora"; ask: string }[] = [
    { agent: "miro", ask: "Otvor poradu: prečo je tento lead príležitosť, aké signály vidíš a čo je najväčšie riziko, že mail zmizne v koši." },
    { agent: "nora", ask: "Reaguj na Mira: ktoré zistenie použiť v prvej vete, čo presne ponúknuť a akým uhlom (psychológia adresáta)." },
    { agent: "miro", ask: "Spochybni Norin návrh: akú námietku alebo podozrenie by majiteľ mal po prečítaní prvých dvoch viet? Čo by ho presvedčilo, aby odpísal?" },
  ];
  try {
    for (const t of order) {
      const transcript = turns.map((x) => `${x.agent.toUpperCase()}: ${x.text}`).join("\n\n");
      const msg = await createMessage(client, {
        model: MODEL(),
        max_tokens: 420,
        temperature: 0.7,
        system: `${PERSONAS[t.agent]}\n\n${SHARED}`,
        messages: [{ role: "user", content: `${dossier}\n\n${transcript ? `DOTERAZ POVEDALI:\n${transcript}\n\n` : ""}${t.ask}` }],
      });
      const text = oneVoice(textFrom(msg));
      if (!text) return null;
      turns.push({ agent: t.agent, text: text.slice(0, 900) });
    }
    const transcript = turns.map((x) => `${x.agent.toUpperCase()}: ${x.text}`).join("\n\n");
    const msg = await createMessage(client, {
      model: MODEL(),
      max_tokens: 700,
      temperature: 0.3,
      system: `${PERSONAS.nora}\n\n${SHARED}\nTeraz porada končí: zhrň jej rozhodnutie. Zvoľ jeden dôraz ponuky, zistenie pre prvú vetu, uhol, najpravdepodobnejšiu námietku s jednou vecnou vetou, ktorá ju zmierni, a najviac 3 riziká.`,
      tools: [DECISION_TOOL],
      tool_choice: { type: "tool", name: "uloz_rozhodnutie" },
      messages: [{ role: "user", content: `${dossier}\n\nPRIEBEH PORADY:\n${transcript}\n\nUlož rozhodnutie.` }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const d = (block?.input ?? {}) as {
      offer_focus?: string;
      open_with?: string | null;
      mail_angle?: string | null;
      objection?: string;
      defusal?: string;
      risks?: unknown;
    };
    const angle = ANGLES.some((a) => a.id === d.mail_angle) ? (d.mail_angle as string) : null;
    const openWith = ctx.findings.some((f) => f.id === d.open_with) ? (d.open_with as string) : null;
    return {
      turns,
      decision: {
        offerFocus: String(d.offer_focus ?? "").slice(0, 400),
        openWith,
        mailAngle: angle,
        objection: String(d.objection ?? "").slice(0, 300),
        defusal: String(d.defusal ?? "").slice(0, 300),
        risks: Array.isArray(d.risks) ? d.risks.map((r) => String(r).slice(0, 160)).slice(0, 3) : [],
      },
    };
  } catch {
    return null;
  }
}
