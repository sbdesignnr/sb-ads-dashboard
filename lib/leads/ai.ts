import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";

const MODEL = "claude-sonnet-4-6";

export interface LeadBrief {
  summary: string; // honest diagnosis in the owner's language
  painPoint: string; // the sharpest business pain point (revenue impact)
  opportunity: string; // concrete thing we'd build + how it earns/saves
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export interface FactsInput {
  companyName: string;
  segmentName: string;
  websiteUrl?: string | null;
  companyCity?: string | null;
  ownerName?: string | null;
  ownerPosition?: string | null;
  websiteScore?: number | null;
  websiteTechnology?: string | null;
  websiteAge?: number | null;
  pageSpeedMobile?: number | null;
  pageSpeedDesktop?: number | null;
  hasSsl?: boolean | null;
  isMobileFriendly?: boolean | null;
  issues?: string[];
}

function factsBlock(f: FactsInput): string {
  const yes = (b: boolean | null | undefined) => (b == null ? "neznáme" : b ? "áno" : "nie");
  const issues = f.issues && f.issues.length ? f.issues.map((i) => `- ${i}`).join("\n") : "- (žiadne konkrétne zistené)";
  return `Firma: ${f.companyName}
Segment: ${f.segmentName}
Web: ${f.websiteUrl ?? "—"}
Mesto: ${f.companyCity ?? "—"}
Konateľ: ${f.ownerName ?? "neznámy"}${f.ownerPosition ? ` (${f.ownerPosition})` : ""}
Skóre zastaralosti webu: ${f.websiteScore ?? "—"}/100 (vyššie = zastaralejšie)
Technológia webu: ${f.websiteTechnology ?? "neznáma"}
Vek webu (podľa copyrightu): ${f.websiteAge != null ? `~${f.websiteAge} rokov` : "neznámy"}
PageSpeed mobile: ${f.pageSpeedMobile ?? "—"}/100, desktop: ${f.pageSpeedDesktop ?? "—"}/100
Má SSL (HTTPS): ${yes(f.hasSsl)}
Mobilne responzívny: ${yes(f.isMobileFriendly)}

Konkrétne zistené nedostatky webu:
${issues}`;
}

function factsFromLead(lead: Lead, segmentName: string): FactsInput {
  return {
    companyName: lead.companyName,
    segmentName,
    websiteUrl: lead.websiteUrl,
    companyCity: lead.companyCity,
    ownerName: lead.ownerName,
    ownerPosition: lead.ownerPosition,
    websiteScore: lead.websiteScore,
    websiteTechnology: lead.websiteTechnology,
    websiteAge: lead.websiteAge,
    pageSpeedMobile: lead.pageSpeedMobile,
    pageSpeedDesktop: lead.pageSpeedDesktop,
    hasSsl: lead.hasSsl,
    isMobileFriendly: lead.isMobileFriendly,
    issues: lead.websiteIssues,
  };
}

const BRIEF_SYSTEM = `Si senior konzultant SB Design (weby a digitálne riešenia na mieru, Slovensko). Dostaneš technické zistenia o webe firmy. Priprav interný podklad pre obchodníka – aby presne vedel, čím firme REÁLNE pomôžeme a na čom firma zarobí.

Filozofia: hodnota, nie nátlak. Nehľadaj chyby pre chyby – hľadaj, kde firma prichádza o klientov, čas alebo peniaze, a čo vieme postaviť, aby to napravila. Vieme spraviť takmer čokoľvek a rýchlo (moderné weby, rezervačné systémy, automatizácie, e-shopy, AI nástroje).

Buď konkrétny a vecný, píš po slovensky, bez marketingových fráz a superlatívov. Zohľadni typ podnikania (segment) – čo v ňom reálne prináša klientov.

Vráť PRESNE tento formát, tri riadky s prefixmi a nič iné navyše:
SUMMARY: 1–2 vety – úprimná diagnóza stavu webu očami majiteľa (nie technický žargón).
PAIN: 1 najsilnejší, konkrétny pain point – čo ho to reálne stojí (stratené rezervácie/klienti/tržby/dôvera/Google návštevnosť). Ak sa dá, naznač dopad.
OPPORTUNITY: 1 konkrétna vec, ktorú by sme postavili, + ako mu pomôže zarobiť alebo ušetriť. Hmatateľné a relevantné pre jeho biznis.`;

const EMAIL_SYSTEM = `Si copywriter SB Design (weby a digitálne riešenia na mieru, Slovensko). Napíš KRÁTKY personalizovaný e-mail konkrétnej firme. Cieľ: aby majiteľ SÁM pocítil, že by mu to pomohlo – žiadny nátlak, žiadne strašenie, žiadna urgencia.

Pravidlá:
- Ak je známy konateľ, oslov ho menom; inak firmu slušne.
- Otvor konkrétnym postrehom o ICH biznise/webe (vychádzaj z pain pointu), nie o nás.
- Pomenuj 1 konkrétny problém a hlavne PRÍLEŽITOSŤ – čo by im to prinieslo (viac rezervácií/klientov/tržieb, menej roboty). Vychádzaj z pripraveného pain pointu a príležitosti nižšie.
- Ponúkni konkrétnu vec, ktorú vieme rýchlo postaviť. Sebavedomo, ale ľudsky.
- Žiadne superlatívy ani fráza typu "posunúť na vyššiu úroveň". Znie ako od človeka, ktorý fakt vie pomôcť.
- Jemné, nezáväzné CTA (napr. že pošleme pár konkrétnych nápadov alebo krátky hovor, ak to bude zaujímať).
- Max 160 slov.
Formát: prvý riadok "Predmet: …", potom prázdny riadok a telo e-mailu.`;

function parseBrief(text: string): LeadBrief {
  const get = (label: string) => {
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:SUMMARY|PAIN|OPPORTUNITY)\\s*:|$)`, "i");
    return re.exec(text)?.[1]?.trim() ?? "";
  };
  const summary = get("SUMMARY");
  const painPoint = get("PAIN");
  const opportunity = get("OPPORTUNITY");
  if (!summary && !painPoint && !opportunity) return { summary: text.trim(), painPoint: "", opportunity: "" };
  return { summary, painPoint, opportunity };
}

/** Structured opportunity brief from concrete website findings. */
export async function generateBrief(f: FactsInput): Promise<LeadBrief> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: BRIEF_SYSTEM,
    messages: [{ role: "user", content: factsBlock(f) }],
  });
  return parseBrief(textOf(msg));
}

export function briefFromLead(lead: Lead, segmentName: string): Promise<LeadBrief> {
  return generateBrief(factsFromLead(lead, segmentName));
}

/** Human-readable analysis (Markdown) for the detail page — built on the brief. */
export async function generateAnalysis(lead: Lead, segmentName: string): Promise<string> {
  const b = await briefFromLead(lead, segmentName);
  const parts: string[] = [];
  if (b.summary) parts.push(b.summary);
  if (b.painPoint) parts.push(`**Kde firma stráca:** ${b.painPoint}`);
  if (b.opportunity) parts.push(`**Čo vieme spraviť:** ${b.opportunity}`);
  return parts.join("\n\n");
}

/** Personalized, value-first cold email using the stored brief if present. */
export async function generateEmail(lead: Lead, segmentName: string): Promise<string> {
  const client = new Anthropic();
  const brief =
    lead.aiPainPoint || lead.aiOpportunity
      ? `\n\nPripravený pain point: ${lead.aiPainPoint ?? "—"}\nPripravená príležitosť (čo postaviť a ako to zarobí): ${lead.aiOpportunity ?? "—"}`
      : "";
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: EMAIL_SYSTEM,
    messages: [{ role: "user", content: factsBlock(factsFromLead(lead, segmentName)) + brief }],
  });
  return textOf(msg);
}
