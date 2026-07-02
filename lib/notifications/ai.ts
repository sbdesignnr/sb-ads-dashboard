import Anthropic from "@anthropic-ai/sdk";
import type { AlertCandidate } from "./types";

const MODEL = "claude-sonnet-4-6";

export interface JudgedAlert {
  key: string;
  send: boolean;
  title: string; // short push title
  body: string; // 1-3 sentences: what happened + the ONE right action
}

const SYSTEM = `Si senior Google Ads špecialista, ktorý dohliada na účet a rozhoduje, KEDY je naozaj potrebné upozorniť majiteľa na mobil. Dostaneš zoznam kandidátov na upozornenie (dáta z účtu). Tvoja úloha je ako brutálne skúsený expert rozhodnúť, ktoré sú NAOZAJ hodné pingnutia teraz, a napísať krátku akčnú správu.

ŽELEZNÉ PRAVIDLÁ (dodržuj striktne):
- Upozorni LEN keď je akcia naozaj potrebná a zmysluplná TERAZ. Radšej menej, ale dôležité.
- NIKDY neodporúčaj časté zmeny kľúčových slov, ponúk (bids) ani reštarty kampaní – to narúša algoritmus. Takéto kandidáty zamietni (send=false).
- REŠPEKTUJ learning phase: ak je kampaň nová/v učení (napr. beží menej než ~14 dní alebo má málo konverzií), NEposielaj alerty o výkone/CPA/anomáliách – výkyvy sú normálne. Zamietni ich.
- Ignoruj bežné denné výkyvy a štatisticky nepodložené signály (málo dát).
- forceSend=true kandidátov (zamietnutá reklama, pozastavený účet, problém s platbou) VŽDY pošli (send=true) – sú kritické a jednoznačné.
- Pri "budget_limited" pošli len ak kampaň zjavne funguje (má konverzie) a rozpočet reálne brzdí – vtedy je zvýšenie rozpočtu bezpečná, hodnotná akcia.
- Pri "tracking_broken" (míňa sa, ale 0 konverzií) pošli len ak je útrata významná a nejde o novú kampaň – navrhni skontrolovať meranie konverzií.

FORMÁT SPRÁVY:
- title: krátky, výstižný (napr. "Zamietnutá reklama – Brand").
- body: 1–3 vety po slovensky – čo sa stalo + JEDNA konkrétna správna akcia. Vecne, bez vaty a bez nátlaku. Ži ako expert, ktorý presne vie, čo spraviť.

Rozhodnutia vlož VÝHRADNE cez nástroj "rozhodni_alerty".`;

const TOOL: Anthropic.Tool = {
  name: "rozhodni_alerty",
  description: "Vráti rozhodnutie pre každý kandidát na alert.",
  input_schema: {
    type: "object",
    properties: {
      alerts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            send: { type: "boolean" },
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["key", "send", "title", "body"],
        },
      },
    },
    required: ["alerts"],
  } as Anthropic.Tool.InputSchema,
};

/** The AI expert decides which candidates to actually push and writes the messages. */
export async function judgeAlerts(candidates: AlertCandidate[]): Promise<JudgedAlert[]> {
  if (!candidates.length) return [];
  const client = new Anthropic();
  const list = candidates
    .map(
      (c) =>
        `- key: ${c.key}\n  typ: ${c.type} | závažnosť: ${c.severity} | forceSend: ${c.forceSend}\n  kampaň: ${c.campaignName ?? "—"}\n  dáta: ${c.facts}`,
    )
    .join("\n");
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "rozhodni_alerty" },
    messages: [{ role: "user", content: `Kandidáti na upozornenie:\n${list}` }],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const out = (block?.input as { alerts?: JudgedAlert[] } | undefined)?.alerts ?? [];
  return out;
}
