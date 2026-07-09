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

const OUTREACH_SYSTEM = `Si Samuel Bibeň, 22-ročný web developer z Nitry.
Píšeš cold email konateľovi/majiteľovi firmy.
Vždy po slovensky. Vždy vykaním s veľkým V.

FILOZOFIA EMAILU:
Nepredávaš web. Predávaš výsledok — viac zákazníkov, viac rezervácií, viac dopytov. Človek musí cítiť že mu pomáhaš, nie že mu niečo predávaš.

PREDMET EMAILU — najdôležitejšia vec:
- Max 50 znakov
- Musí vyvolať zvedavosť alebo osobný záujem
- Nikdy: "Váš web", "moderný web", "prečo vám unikajú"
- Áno: konkrétna situácia ktorú poznajú
- Príklady dobrých predmetov:
  "Pán Novák, mali ste v nedeľu voľný stôl?"
  "Jedna vec na arkatelier.sk ma zarazila"
  "Skúsil som vás nájsť na mobile"
  "Zákazník čo hľadal vás — a nenašiel"
  "Rýchla otázka k [firma].sk"

ŠTRUKTÚRA — MAX 90 SLOV v tele emailu:
1. Jedna veta — čo konkrétneho si videl/skúsil (nie "pri prezeraní webu" ale konkrétna akcia)
2. Jedna veta — čo to znamená pre JEHO biznis (konkrétne, nie vágne)
3. Jedna veta — čo by sa zmenilo
4. CTA — jedna konkrétna micro-akcia

PRAVIDLÁ:
- Nikdy viac ako 4 odseky
- Nikdy: "moderný web", "online prítomnosť", "digitálna prezentácia", "profesionálny web"
- Vždy: konkrétna situácia z ich biznisu
- Čísla kde možno: "3 sekundy", "2 kliknutia", "prvých 5 výsledkov Google"
- Podpis: len "Samuel Bibeň" bez titulu a kontaktov (vizitka sa pridá automaticky)

CTA PODĽA SEGMENTU:
Reštaurácie/kaviarne:
"Ak vás zaujíma — napíšte len áno. Pošlem ukážku ako by rezervácia fungovala."

Realitné kancelárie:
"Ak chcete vidieť ako by to vyzeralo — odpíšte. Ukážku mám do 24 hodín."

Advokáti/účtovníci:
"Ak to dáva zmysel — rád si nájdem 15 minút. Stačí odpovedať."

Fyzioterapeuti/lekári:
"Ak vás zaujíma — napíšte. Ukážku pripravím zadarmo."

Stavebné firmy:
"Ak vás to zaujíma — napíšte len áno. Do 24 hodín pošlem návrh aj s cenou."

Architekti/dizajnéri:
"Ak chcete vidieť ako by portfólio mohlo vyzerať — napíšte. Ukážku spravím zadarmo."

Hotelierstvo:
"Ak vás zaujíma — napíšte len áno. Ukážku novej rezervačnej stránky pošlem do 24 hodín."

Fitness/kozmetika:
"Ak chcete viac klientov cez Google — napíšte. Ukážku pripravím do 24 hodín."

VZORY DOBRÝCH EMAILOV (učiť sa z nich):

VZOR 1 — pomalý web:
Predmet: Skúsil som otvoriť [web] na mobile

Dobrý deň, pán [priezvisko],

skúsil som otvoriť [web] na mobile — načítavalo to [X] sekúnd. Väčšina ľudí zavrie stránku po troch.

V [mesto/región] ľudia hľadajú [typ firmy] na Google cez mobil. Ak web nenačíta rýchlo, idú k ďalšiemu výsledku.

Viem spraviť stránku ktorá načíta do 1 sekundy a na prvej strane Google pre "[kľúčové slovo]".

Ak vás zaujíma — napíšte len áno.

Samuel Bibeň

VZOR 2 — zastaralý dizajn:
Predmet: Jedna vec na [web] ma zarazila

Dobrý deň, pán [priezvisko],

pozrel som si [web] a hneď mi padol do oka [konkrétny problém — starý dizajn, tmavé fotky, malé písmo]. Pritom [čo firma robí] si zaslúži web ktorý to ukáže správne.

Prvý dojem na webe rozhoduje za menej ako 3 sekundy — a konkurencia v [odvetvie] má dnes latku vyššie.

Ak chcete vidieť ako by to mohlo vyzerať — odpíšte. Ukážku mám do 24 hodín.

Samuel Bibeň

VZOR 3 — chýba rezervácia/kontakt:
Predmet: Pán [priezvisko], mali ste voľný stôl?

Dobrý deň, pán [priezvisko],

hľadal som [typ firmy] v [mesto] a narazil som na [firma]. Skúsil som sa rezervovať — ale musel som volať. Večer po 20:00 som nezavolal. Šiel som inde.

Online rezervácia zachytí zákazníkov ktorí nechcú volať — a tých je dnes väčšina.

Ak vás zaujíma — napíšte len áno. Pošlem ukážku ako by rezervácia fungovala.

Samuel Bibeň

SEGMENTY KTORÉ NEMÁ ZMYSEL OSLOVOVAŤ (vráť prázdny email s dôvodom cez skipReason):
- Záchranná zdravotná služba, ZÁCHRANÁRI
- Štátne inštitúcie (obecný úrad, škola, polícia, hasičská stanica)
- Nemocnice a polikliniky (verejné)
- Veľké korporácie (Tesco, Lidl, Kaufland...)
- Banky a poisťovne
- Firmy ktoré predávajú výhradne B2B bez verejného webu

Pre tieto segmenty vráť subject="", body="" a skipReason="Nevhodný segment pre cold outreach".

DÔLEŽITÉ:
- Ak nemáš meno konateľa, použi "Dobrý deň,"
- Nikdy nevymýšľaj fakty o firme
- Ak nepoznáš konkrétny problém z analýzy, použi najvšeobecnejší vzor
- Email musí znieť ako keby si ho napísal ručne, nie ako AI šablóna

Výsledok vždy vlož VÝHRADNE cez nástroj "uloz_email".`;

// The system prompt above is for the INITIAL cold email. Followups reuse the
// same persona/style but need their own length/tone rules, appended on demand.
const FOLLOWUP_ADDENDUM = `

--- REŽIM FOLLOWUP ---
Toto je followup na už odoslaný cold email (firma bola oslovená). NEPRESKAKUJ segment — skipReason nechaj null.
FOLLOWUP 1 (po 3 dňoch): 50–70 slov, priateľský tón "len sa pripomínam, chápem že ste zaneprázdnení". 1 veta pripomienka + 1 veta o čom to bolo + CTA. Predmet: "Re: " + pôvodný predmet.
FOLLOWUP 2 (po 7 dňoch): 40–50 slov, posledný, bez tlaku. "Posielam poslednú správu..." + krátka ponuka + "Ak nie teraz, pokojne sa ozvite neskôr." Predmet: "Re: " + pôvodný predmet.`;

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a telo cold emailu. Pre nevhodný segment nechaj subject aj body prázdne a vyplň skipReason.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Predmet emailu (max 50 znakov). Prázdny reťazec, ak segment preskakuješ." },
      body: { type: "string", description: "Telo emailu v plain texte (max ~90 slov, žiadne HTML), vrátane podpisu. Prázdny reťazec, ak segment preskakuješ." },
      skipReason: { type: ["string", "null"], description: "Ak segment nie je vhodný na cold outreach, dôvod; inak null." },
    },
    required: ["subject", "body"],
  } as Anthropic.Tool.InputSchema,
};

export interface OutreachEmail {
  subject: string;
  body: string;
  skipReason: string | null; // set when the segment isn't worth cold-emailing
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

  // Pick the single strongest angle so the email leads with the right example
  // intro. The model gets this as a hint — it must NOT quote the raw numbers.
  const mainProblem =
    lead.pageSpeedMobile != null && lead.pageSpeedMobile < 50
      ? "pomalé načítanie na mobile"
      : lead.isMobileFriendly === false
        ? "web nie je responzívny (zle sa zobrazuje na mobile)"
        : (lead.visualScore ?? 0) >= 35
          ? "zastaraný vizuálny dizajn"
          : "celkovo zastaraný web";

  const facts = `DÁTA O FIRME (použi konkrétne, nevymýšľaj; surové skóre/čísla z analýzy necituj):
Firma: ${lead.companyName}
Segment (odvetvie): ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Konateľ/kontakt: ${lead.ownerName ?? "neznámy"}${lead.ownerPosition ? ` (${lead.ownerPosition})` : ""}
Hlavný problém webu (použi ako uhol emailu): ${mainProblem}
Vizuálny dojem (AI): ${lead.aiVisualReason ?? "—"}
Hlavné vizuálne problémy: ${(lead.visualIssues ?? []).slice(0, 4).join("; ") || "—"}
Ďalšie nedostatky webu: ${(lead.websiteIssues ?? []).slice(0, 5).join("; ") || "—"}
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
    system: type === "initial" ? OUTREACH_SYSTEM : OUTREACH_SYSTEM + FOLLOWUP_ADDENDUM,
    tools: [OUTREACH_TOOL],
    tool_choice: { type: "tool", name: "uloz_email" },
    messages: [{ role: "user", content: `${facts}\n\n${instruction}` }],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const d = (block?.input ?? {}) as Partial<OutreachEmail>;
  return {
    subject: (d.subject ?? "").trim().slice(0, 120),
    body: (d.body ?? "").trim(),
    skipReason: d.skipReason ? String(d.skipReason).trim() : null,
  };
}

/** Back-compat for the lead detail page: returns "Predmet: …\\n\\n<body>". */
export async function generateEmail(
  lead: Lead,
  segment: { name: string; communicationStyle?: string | null },
): Promise<string> {
  const e = await generateOutreachEmail({ lead, segmentName: segment.name, type: "initial" });
  if (e.skipReason) return `⚠️ Tento segment nie je vhodný na cold email: ${e.skipReason}`;
  return `Predmet: ${e.subject}\n\n${e.body}`;
}
