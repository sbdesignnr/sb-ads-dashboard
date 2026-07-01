import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function leadFacts(lead: Lead, segmentName: string): string {
  const yes = (b: boolean | null) => (b === null ? "neznáme" : b ? "áno" : "nie");
  return `Firma: ${lead.companyName}
Segment: ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Konateľ: ${lead.ownerName ?? "neznámy"}${lead.ownerPosition ? ` (${lead.ownerPosition})` : ""}
Skóre zastaralosti webu: ${lead.websiteScore ?? "—"}/100 (vyššie = zastaralejšie)
Technológia webu: ${lead.websiteTechnology ?? "neznáma"}
Vek webu (podľa copyrightu): ${lead.websiteAge != null ? `~${lead.websiteAge} rokov` : "neznámy"}
PageSpeed mobile: ${lead.pageSpeedMobile ?? "—"}/100, desktop: ${lead.pageSpeedDesktop ?? "—"}/100
Má SSL (HTTPS): ${yes(lead.hasSsl)}
Mobilne responzívny: ${yes(lead.isMobileFriendly)}`;
}

export async function generateAnalysis(lead: Lead, segmentName: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system:
      "Si expert na tvorbu webov a digitálny marketing (SB Design). Na základe technických dát o webe firmy stručne (max 150 slov, po slovensky, Markdown odrážky) vysvetli: 1) PREČO je web zastaralý (konkrétne problémy z dát), 2) ČO konkrétne by sme firme mohli ponúknuť (redizajn, rýchlosť, mobilná verzia, SSL, SEO…). Buď konkrétny a vecný.",
    messages: [{ role: "user", content: leadFacts(lead, segmentName) }],
  });
  return textOf(msg);
}

export async function generateEmail(lead: Lead, segmentName: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: `Si copywriter SB Design (tvorba webov na mieru a online marketing, Nitra/Slovensko). Napíš KRÁTKY personalizovaný cold email po slovensky pre konkrétnu firmu.

Pravidlá:
- Ak je známy konateľ, oslov ho menom; inak oslov firmu slušne.
- Spomeň 1–2 KONKRÉTNE problémy ich webu z dát (napr. pomalý na mobile, chýba HTTPS, zastaraná technológia, nie je responzívny).
- Ponúkni konkrétne riešenie a stručný benefit (viac zákazníkov, dôveryhodnosť, rýchlosť).
- Priateľský, ľudský tón — nie spam, žiadne prehnané superlatívy.
- Ukonči jemným CTA (nezáväzná 15-min konzultácia).
- Max 150 slov.
Vráť email vo formáte: prvý riadok "Predmet: …", potom prázdny riadok a telo emailu.`,
    messages: [{ role: "user", content: leadFacts(lead, segmentName) }],
  });
  return textOf(msg);
}
