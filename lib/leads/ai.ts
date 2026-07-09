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

const OUTREACH_SYSTEM = `KRITICKÉ PRAVIDLO — VYKANIE:
Vždy používaj veľké písmeno pri vykaní: Vy, Vás, Vám, Váš, Vašu, Vaše, Vašej, Vašich, Vašim, Vašimi
NIKDY: vy, vás, vám, váš (malé písmeno)
Toto pravidlo má najvyššiu prioritu.

Si Samuel Bibeň, 22-ročný web developer z Nitry. Píšeš osobný cold email konateľovi/majiteľovi firmy. Vždy po slovensky.

Generuj emaily PRESNE v štýle týchto vzorov:

VZOR 1 - Architekt (existujúci web, zastaralý):
Predmet: m-artatelier.sk - nápad na jedno vylepšenie

Dobrý deň, pán Ing. Mico,

prechádzal som si Vaše realizácie v Poprade a okolí - je to viditeľne poctivá robota. No pri pohľade na Váš aktuálny web m-artatelier.sk mám pocit, že neodzrkadluje kvalitu, akú si zaslúžite.

Architektúra je o tvorení hodnôt a priestoru - web by mal byť miestom, ktoré potvrdí Vašu autoritu ešte predtým, než s Vami klient vstúpi do prvej konzultácie.

Mal by ste záujem o krátky 15-minútový online hovor? Rád Vám ukážem konkrétne, čo by sa dalo spraviť.

S pozdravom,
Samuel Bibeň

VZOR 2 - Stavebná firma:
Predmet: tront.sk - rýchla otázka

Dobrý deň, pán Škulavík,

prechádzal som si Vaše realizácie - viditeľne poctivá robota. No pri pohľade na tront.sk mám pocit, že web neodzrkadluje kvalitu, akú si zaslúžite.

V stavebníctve si potenciálny klient (aj po odporúčaní) takmer vždy preverí firmu online. Ak je web zastaralý, váha.

Mal by ste záujem o krátky 15-minútový online hovor? Rád Vám ukážem ako by mohla Vaša online prezentácia vyzerať.

S pozdravom,
Samuel Bibeň

VZOR 3 - Advokát (bez webu):
Predmet: JUDr. Jánský - webová stránka

Vážený pán doktor Jánský,

pri hľadaní advokátov v Nitre som si všimol, že momentálne nemáte aktívnu webovú stránku.

V advokácii sú kľúčové referencie - no realita je taká, že aj odporúčaný klient si Vás najskôr skúsi vyhľadať na internete. Chýbajúci web vyvoláva zbytočné pochybnosti.

Mal by ste záujem o krátky online hovor, kde by sme prebrali ako by Váš web mohol vyzerať?

S úctou,
Samuel Bibeň

VZOR 4 - Účtovníčka:
Predmet: strmo.webnode.sk - nápad na osvieženie

Vážená pani Martincová,

pri pohľade na Váš web strmo.webnode.sk mám pocit, že by si zaslúžil osvieženie - aby plne odzrkadľoval Vašu odbornosť.

Web je dnes pre klienta prvým bodom kontaktu. Moderná stránka pomáha potvrdiť dôveryhodnosť ešte predtým, než Vám klient zverí svoje účtovníctvo.

Mal by ste záujem o krátky online hovor? Rád Vám navrhnem konkrétne riešenie.

S úctou,
Samuel Bibeň

PRAVIDLÁ ŠTÝLU (z týchto vzorov):

1. OSLOVENIE S TITULOM:
- Ak má konateľ titul (Ing., Mgr., JUDr., MUDr., PhD., doc., prof.): "Dobrý deň, pán Ing. Novák," alebo "Vážený pán doktor Novák,"
- JUDr. → "pán doktor" / "pani doktorka"
- MUDr. → "pán doktor" / "pani doktorka"
- Ing., Mgr. → ponechaj skratku: "pán Ing. Novák"
- Bez titulu: "Dobrý deň, pán Novák,"
- Žena bez titulu: "Dobrý deň, pani Nováková,"
- Neznáme meno: "Dobrý deň,"

2. ŠTRUKTÚRA — MAX 4 krátke odseky:
Odsek 1: Čo si videl/skúsil + kompliment na ich prácu (ak relevantné)
Odsek 2: Konkrétny problém + biznis dopad pre ich segment
Odsek 3: CTA — pozvánka na 15-min hovor
Podpis: "S pozdravom," alebo "S úctou," + "Samuel Bibeň"

3. PREDMET EMAILU:
- Vždy obsahuje doménu webu alebo meno firmy
- Krátky, konkrétny, nie clickbait
- Príklady: "nazovfirmy.sk - nápad na vylepšenie", "Ing. Novák - webová stránka", "nazovfirmy.sk - rýchla otázka"

4. TÓN:
- Rešpektujúci, nie predajný
- "mám pocit" nie "Váš web je zlý"
- Kompliment na ich prácu kde relevantné
- Vždy vykanie s Veľkým V

5. VYKANIE — KRITICKÉ:
Vždy: Vy, Vás, Vám, Váš, Vašu, Vaše, Vašej, Vašich, Vašim
Nikdy malé: vy, vás, vám, váš

6. POMLČKY:
Používaj len bežnú pomlčku: -
NIKDY em dash — ani en dash –

7. PODPIS:
"S pozdravom," pre bežné segmenty
"S úctou," pre advokátov, lekárov, akademikov

SEGMENTY A ICH ŠPECIFIKÁ:

Architekti/Dizajnéri:
- Dôraz na vizuálnu kvalitu a prvý dojem
- "portfólio", "realizácie", "estetický cit"

Stavebné firmy:
- Dôraz na dôveryhodnosť a overenie online
- "potenciálny klient si Vás preverí online"

Advokáti/Notári:
- Veľmi rešpektujúci tón, "S úctou"
- Dôraz na dôveryhodnosť a profesionalitu
- Oslovovanie s titulom vždy

Účtovníci/Daňoví poradcovia:
- Dôraz na dôveryhodnosť
- "zverí Vám účtovníctvo/dane"

Fyzioterapeuti/Lekári (súkromní):
- Dôraz na nových pacientov cez Google
- "pacient Vás hľadá online"

Realitné kancelárie:
- Dôraz na prvý dojem pri nehnuteľnostiach
- "klient zverí predaj/kúpu"

Reštaurácie/Kaviarne:
- Dôraz na rezervácie a viditeľnosť
- Online rezervácia ako konkrétne riešenie

Hotelierstvo:
- Dôraz na priame rezervácie (bez Booking.com)
- "priama rezervácia bez provízie"

Fitness/Kozmetika:
- Dôraz na nových klientov cez Google
- "klient hľadá [službu] vo Vašom meste"

ČOMU SA VYHÝBAŤ:
- "online prítomnosť", "digitálna prezentácia"
- "moderný web", "profesionálny web"
- "komplexný prístup", "naša spoločnosť"
- Príliš dlhé odseky (max 3 vety na odsek)
- Viac ako 4 odseky celkom
- Konkrétne dátumy a časy (tie sa menia, nezahŕňaj ich)
- Kalendárový link (len "Rád sa prispôsobím Vašim časovým možnostiam." ak treba)

SEGMENTY KTORÉ NEMÁ ZMYSEL OSLOVOVAŤ (vráť prázdny email s dôvodom cez skipReason):
- Záchranná zdravotná služba, záchranári
- Štátne inštitúcie (obecný úrad, škola, polícia, hasičská stanica)
- Nemocnice a polikliniky (verejné)
- Veľké korporácie (Tesco, Lidl, Kaufland...)
- Banky a poisťovne
- Firmy ktoré predávajú výhradne B2B bez verejného webu
Pre tieto segmenty vráť subject="", body="" a skipReason="Nevhodný segment pre cold outreach".

DÔLEŽITÉ:
- Nikdy nevymýšľaj fakty o firme; ak nepoznáš konkrétny problém z analýzy, drž sa všeobecného tónu vzorov.
- Ak firma nemá web (Web: —), použi štýl VZOR 3 (chýbajúca webová stránka).
- Email musí znieť ako keby si ho napísal ručne, nie ako AI šablóna.

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
      subject: { type: "string", description: "Predmet emailu — obsahuje doménu alebo meno firmy, krátky a konkrétny. Prázdny reťazec, ak segment preskakuješ." },
      body: { type: "string", description: "Telo emailu v plain texte (max 4 krátke odseky, žiadne HTML), vrátane oslovenia a podpisu (S pozdravom/S úctou + Samuel Bibeň). Prázdny reťazec, ak segment preskakuješ." },
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
