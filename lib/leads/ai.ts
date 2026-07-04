import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";

const MODEL = "claude-sonnet-4-6";

export interface LeadDossier {
  ownerName: string | null; // person to address (from website or ORSR)
  ownerRole: string | null;
  email: string | null; // best contact e-mail found on the site
  phone: string | null; // best contact phone
  summary: string; // honest diagnosis incl. design & optimization
  painPoint: string; // sharpest business pain point (revenue impact)
  opportunity: string; // concrete thing we'd build + how it earns
  bestContactTime: string; // best outreach window for this profession
  outreachAngle: string; // how to approach & tone for this person/segment
}

export interface DossierInput {
  companyName: string;
  segmentName: string;
  communicationStyle?: string | null;
  websiteUrl?: string | null;
  companyCity?: string | null;
  ico?: string | null;
  companyActive?: boolean | null;
  orsrStatusNote?: string | null;
  orsrOwnerName?: string | null;
  orsrOwnerPosition?: string | null;
  placesPhone?: string | null;
  extractedEmails?: string[];
  extractedPhones?: string[];
  websiteScore?: number | null;
  websiteTechnology?: string | null;
  websiteAge?: number | null;
  pageSpeedMobile?: number | null;
  pageSpeedDesktop?: number | null;
  hasSsl?: boolean | null;
  isMobileFriendly?: boolean | null;
  issues?: string[];
  pageText?: string;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function dossierFacts(f: DossierInput): string {
  const yes = (b: boolean | null | undefined) => (b == null ? "neznáme" : b ? "áno" : "nie");
  const list = (a?: string[]) => (a && a.length ? a.join(", ") : "—");
  const issues = f.issues && f.issues.length ? f.issues.map((i) => `- ${i}`).join("\n") : "- (žiadne konkrétne zistené)";
  return `FIRMA
Názov: ${f.companyName}
Segment (typ podnikania): ${f.segmentName}
Mesto: ${f.companyCity ?? "—"}
IČO: ${f.ico ?? "—"}  | Stav v registri: ${f.companyActive == null ? "neznámy" : f.companyActive ? "aktívna" : "NEAKTÍVNA"}${f.orsrStatusNote ? ` (${f.orsrStatusNote})` : ""}
Konateľ podľa ORSR: ${f.orsrOwnerName ?? "—"}${f.orsrOwnerPosition ? ` (${f.orsrOwnerPosition})` : ""}
Telefón (Google): ${f.placesPhone ?? "—"}

KONTAKTY NÁJDENÉ NA WEBE
E-maily: ${list(f.extractedEmails)}
Telefóny: ${list(f.extractedPhones)}

TECHNICKÝ STAV WEBU
Web: ${f.websiteUrl ?? "—"}
Skóre zastaralosti: ${f.websiteScore ?? "—"}/100 (vyššie = zastaralejšie)
Technológia: ${f.websiteTechnology ?? "neznáma"}
Vek podľa copyrightu: ${f.websiteAge != null ? `~${f.websiteAge} rokov` : "neznámy"}
PageSpeed mobil: ${f.pageSpeedMobile ?? "—"}/100, desktop: ${f.pageSpeedDesktop ?? "—"}/100
SSL/HTTPS: ${yes(f.hasSsl)}  | Responzívny: ${yes(f.isMobileFriendly)}
Zistené nedostatky:
${issues}

TEXT Z WEBU (úryvok, home + kontakt/o-nás)
${f.pageText ? f.pageText.slice(0, 4500) : "(web sa nepodarilo načítať)"}`;
}

const DOSSIER_SYSTEM = `Si senior konzultant a obchodník SB Design (weby a digitálne riešenia na mieru, Slovensko). Dostaneš kompletné dáta o firme a jej webe. Priprav dôkladný podklad pre oslovenie – tak, aby obchodník presne vedel, KOHO, KEDY a AKO osloviť a čím firme reálne pomôžeme (a na čom zarobí).

Zásady:
- KONTAKTY (dôležité, NEVYMÝŠĽAJ): e-mail vyber IBA zo zoznamu "E-maily" nižšie – ak je prázdny, daj null. Telefón vyber IBA zo zoznamu "Telefóny" alebo z "Telefón (Google)" – inak null. NIKDY nevymýšľaj e-mail ani číslo. Meno majiteľa/konateľa urči z textu webu alebo ORSR (uprednostni konkrétnu osobu pred generickým info@); ak sa nedá, null.
- ANALÝZA (summary): 2–4 vety, MAX ~80 slov. Posúď stručne to najdôležitejšie – vek/modernosť dizajnu, responzívnosť, rýchlosť, konverzné prvky (rezervácia, formulár, CTA), SEO, dôveryhodnosť. Konkrétne, žiadna vata.
- PAIN: 1 najsilnejší pain point – čo to firmu reálne stojí (stratení klienti/rezervácie/tržby/dôvera/Google návštevnosť). Ak sa dá, naznač dopad. Max ~50 slov.
- OPPORTUNITY: 1 konkrétna vec, ktorú postavíme, + ako mu pomôže zarobiť/ušetriť. Hmatateľné a relevantné pre jeho typ podnikania. Max ~50 slov.
- BEST CONTACT TIME: konkrétne dni + hodinové okno + krátky dôvod, podľa typu profesie. Max ~40 slov.
- OUTREACH ANGLE: ako a akým tónom osloviť tohto človeka – prispôsob typu podnikania (advokát = formálne, vecne; fitness tréner = neformálne, energicky). Bez nátlaku. Max ~40 slov.
- Píš po slovensky, vecne, bez marketingových fráz a superlatívov. VYPLŇ VŠETKY polia.

Ak je firma NEAKTÍVNA v registri, jasne to spomeň v summary (nemá zmysel ju oslovovať).

Výsledok vlož VÝHRADNE cez nástroj "uloz_dossier".`;

const DOSSIER_TOOL: Anthropic.Tool = {
  name: "uloz_dossier",
  description: "Uloží štruktúrovaný podklad k leadu.",
  input_schema: {
    type: "object",
    properties: {
      ownerName: { type: ["string", "null"], description: "Meno majiteľa/konateľa alebo null" },
      ownerRole: { type: ["string", "null"], description: "Rola/pozícia alebo null" },
      email: { type: ["string", "null"], description: "Najlepší kontaktný e-mail z webu alebo null" },
      phone: { type: ["string", "null"], description: "Najlepší kontaktný telefón alebo null" },
      summary: { type: "string", description: "Úprimná hĺbková diagnóza webu (dizajn, optimalizácia, SEO, konverzie)" },
      painPoint: { type: "string", description: "Najsilnejší pain point s dopadom" },
      opportunity: { type: "string", description: "Konkrétne riešenie + ako zarobí/ušetrí" },
      bestContactTime: { type: "string", description: "Najlepší čas oslovenia + krátky dôvod" },
      outreachAngle: { type: "string", description: "Ako a akým tónom osloviť tohto človeka" },
    },
    required: ["ownerName", "ownerRole", "email", "phone", "summary", "painPoint", "opportunity", "bestContactTime", "outreachAngle"],
  } as Anthropic.Tool.InputSchema,
};

/** Full AI dossier: contact extraction + deep analysis + pain/opportunity + timing + angle. */
export async function generateDossier(f: DossierInput): Promise<LeadDossier> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: DOSSIER_SYSTEM,
    tools: [DOSSIER_TOOL],
    tool_choice: { type: "tool", name: "uloz_dossier" },
    messages: [{ role: "user", content: dossierFacts(f) }],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const d = (block?.input ?? {}) as Partial<LeadDossier>;

  // Safety net against hallucinated contacts: only accept an e-mail/phone that was
  // actually scraped from the site (or the Google phone).
  const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
  const emailPool = new Set((f.extractedEmails ?? []).map((e) => e.toLowerCase()));
  const phonePool = new Set([...(f.extractedPhones ?? []), f.placesPhone ?? ""].filter(Boolean).map(digits));
  const email = d.email && emailPool.has(d.email.toLowerCase()) ? d.email : (f.extractedEmails?.[0] ?? null);
  const phone = d.phone && phonePool.has(digits(d.phone)) ? d.phone : (f.extractedPhones?.[0] ?? f.placesPhone ?? null);

  return {
    ownerName: d.ownerName ?? null,
    ownerRole: d.ownerRole ?? null,
    email,
    phone,
    summary: d.summary ?? "",
    painPoint: d.painPoint ?? "",
    opportunity: d.opportunity ?? "",
    bestContactTime: d.bestContactTime ?? "",
    outreachAngle: d.outreachAngle ?? "",
  };
}

const OUTREACH_SYSTEM = `Si Samuel Bibeň, 22-ročný web developer z Nitry. Píšeš osobný cold email majiteľovi/konateľovi firmy. Píšeš vždy v slovenčine.

PRAVIDLÁ ŠTÝLU:
- Píš ako človek, nie ako marketér. Krátke vety. Bez buzzwords.
- NIKDY NEPOUŽÍVAJ: "radi by sme", "naša spoločnosť", "profesionálne riešenia", "komplexný prístup", "digitálna prezentácia", "online prítomnosť", "webová stránka" (použi "web" alebo "stránka")
- VŽDY: konkrétny problém ktorý si videl priamo na ich webe, konkrétny dopad na ich biznis v ich odvetví
- Dĺžka tela emailu: 100-150 slov MAX
- Tón: vecný, priamy, ľudský, bez preháňania
- Nikdy nezačínaj prvú vetu s "Moje meno je" alebo komplimentom

ŠTRUKTÚRA EMAILU:
1. Oslovenie: "Dobrý deň, pán/pani [priezvisko]," (ak neznáme meno, použi "Dobrý deň,")
2. Odsek 1 (2-3 vety): Čo konkrétne si videl na ich webe + čo to znamená pre ich biznis
3. Odsek 2 (1-2 vety): Čo vieš spraviť — jednoducho, bez techno-žargónu
4. CTA (1 veta): Podľa segmentu (pozri nižšie)
5. Podpis: Ukonči email len s "S pozdravom,\\nSamuel Bibeň" - bez telefónu, bez webu, bez ďalších kontaktov. Vizitka sa pridá automaticky.

PREDMET EMAILU — pravidlá:
- Konkrétny, nie clickbait
- Spomína ich web alebo firmu
- Max 60 znakov
- Príklady dobrých predmetov:
  "Web stavreko.sk – prečo vám unikajú dopyty zo Zvolena"
  "arkatelier.sk – nápad na jedno vylepšenie"
  "completreal.sk – rýchla otázka"

CTA PODĽA SEGMENTU:
- Stavebné firmy / remeselníci: "Ak vás to zaujíma — napíšte len áno a do 24 hodín pošlem ukážku aj s orientačnou cenou. Žiadne záväzky."
- Realitné kancelárie: "Ak chcete vidieť ako by to vyzeralo pre vás — stačí odpovedať. Ukážku pripravím do 24 hodín."
- Advokáti / účtovníci: "Ak má zmysel sa o tom porozprávať, rád si nájdem 15 minút. Stačí odpovedať na tento mail."
- Architekti / dizajnéri: "Ak vás zaujíma ako by mohlo vaše portfólio vyzerať — napíšte mi. Ukážku spravím zadarmo."
- Fyzioterapeuti / psychológovia / lekári: "Ak vás zaujíma ako to vyriešiť — napíšte mi. Ukážku nového webu pripravím zadarmo."
- Fitness tréneri / športové štúdiá: "Ak chcete viac klientov cez Google — stačí napísať. Ukážku pripravím do 24 hodín."
- Reštaurácie / kaviarne: "Ak vás zaujíma ako by to vyzeralo — odpíšte. Návrh pripravím do 24 hodín."
- Ostatné: "Ak vás to zaujíma — stačí odpovedať. Rád ukážem konkrétny návrh."

FOLLOWUP 1 (po 3 dňoch) — kratší, priateľský:
Dĺžka: 50-70 slov
Tón: "len sa pripomínam, chápem že ste zaneprázdnení"
Štruktúra: 1 veta pripomienka na predošlý mail + 1 veta o čom to bolo + CTA
Predmet: "Re: " + pôvodný predmet

FOLLOWUP 2 (po 7 dňoch) — posledný, bez tlaku:
Dĺžka: 40-50 slov
Tón: definitívny, bez tlaku, nechávam dvere otvorené
Štruktúra: "Posielam poslednú správu..." + krátka ponuka + "Ak nie teraz, pokojne sa ozvite neskôr."
Predmet: "Re: " + pôvodný predmet

ČOMU SA VŽDY VYHÝBAJ:
- Viac ako 3 odseky v hlavnom emailu
- Slová: "prezentácia", "portfólio webu", "moderný web" (príliš generic), "profesionálny"
- Otázky na konci ("Čo myslíte?", "Mali by ste záujem?") — namiesto toho priamy CTA
- HTML formátovanie v tele — plain text znie ľudskejšie

Výsledok vlož VÝHRADNE cez nástroj "uloz_email".`;

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a telo cold emailu.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Predmet emailu (max 60 znakov, spomína web/firmu)" },
      body: { type: "string", description: "Telo emailu v plain texte (žiadne HTML), vrátane podpisu" },
    },
    required: ["subject", "body"],
  } as Anthropic.Tool.InputSchema,
};

export interface OutreachEmail {
  subject: string;
  body: string;
}

/** Generate an initial cold email or a follow-up as { subject, body }. */
export async function generateOutreachEmail(input: {
  lead: Lead;
  segmentName: string;
  type: "initial" | "followup1" | "followup2";
  previousSubject?: string | null;
  previousBody?: string | null;
}): Promise<OutreachEmail> {
  const { lead, segmentName, type } = input;
  const facts = `DÁTA O FIRME (použi konkrétne, nevymýšľaj):
Firma: ${lead.companyName}
Segment (odvetvie): ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Konateľ/kontakt: ${lead.ownerName ?? "neznámy"}${lead.ownerPosition ? ` (${lead.ownerPosition})` : ""}
Konkrétne nedostatky webu: ${(lead.websiteIssues ?? []).slice(0, 5).join("; ") || "—"}
Pain point: ${lead.aiPainPoint ?? "—"}
Príležitosť (čo vieme spraviť): ${lead.aiOpportunity ?? "—"}
Zhrnutie stavu webu: ${lead.aiSummary ?? "—"}`;

  const instruction =
    type === "initial"
      ? "Napíš PRVÝ (initial) cold email podľa štruktúry a pravidiel."
      : type === "followup1"
        ? `Napíš FOLLOWUP 1 (po 3 dňoch). Predmet: "Re: ${input.previousSubject ?? lead.companyName}". Nadväzuj na predošlý email:\n"""\n${input.previousBody ?? ""}\n"""`
        : `Napíš FOLLOWUP 2 (po 7 dňoch), posledný. Predmet: "Re: ${input.previousSubject ?? lead.companyName}". Nadväzuj na predošlý email:\n"""\n${input.previousBody ?? ""}\n"""`;

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: OUTREACH_SYSTEM,
    tools: [OUTREACH_TOOL],
    tool_choice: { type: "tool", name: "uloz_email" },
    messages: [{ role: "user", content: `${facts}\n\n${instruction}` }],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const d = (block?.input ?? {}) as Partial<OutreachEmail>;
  return { subject: (d.subject ?? "").trim().slice(0, 120), body: (d.body ?? "").trim() };
}

/** Back-compat for the lead detail page: returns "Predmet: …\\n\\n<body>". */
export async function generateEmail(
  lead: Lead,
  segment: { name: string; communicationStyle?: string | null },
): Promise<string> {
  const e = await generateOutreachEmail({ lead, segmentName: segment.name, type: "initial" });
  return `Predmet: ${e.subject}\n\n${e.body}`;
}
