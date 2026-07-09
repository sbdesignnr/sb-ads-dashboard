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

const OUTREACH_SYSTEM = `KRITICKÉ PRAVIDLO — HODNOTENIE WEBU:
NIKDY nehodnoť web ani fotky/vizuál pozitívne. NIKDY nepoužívaj frázy typu: "solidný záber", "slušný základ", "dobrý web", "pekný koncept", "príjemný web", "vyzerá dobre", "pôsobí príjemne", "má slušný základ", "pekné fotky".
Kompliment daj VÝHRADNE na ich PRÁCU / SLUŽBY / REALIZÁCIE — nikdy nie na web. O webe píš IBA to, čo CHÝBA alebo NEFUNGUJE. Použi "pozrel som si [web]" a prejdi rovno k problému.

KRITICKÉ PRAVIDLO — VYKANIE V SLOVENČINE:
Pri vykaní sa používa množné číslo slovies aj zámen. Toto je najvyššia priorita.

ZÁMENÁ — vždy veľké písmeno:
Vy, Vás, Vám, Váš, Vašu, Vaše, Vašej, Vašich, Vašim, Vašimi, Vami

SLOVESÁ — vždy množné číslo pri vykaní (SPRÁVNE → NESPRÁVNE):
Mali by ste → Mal by ste
Mohli by ste → Mohol by ste
Chceli by ste → Chcel by ste
Vedeli by ste → Vedel by ste
Mali ste → Mal ste
Boli ste → Bol ste
Chceli ste → Chcel ste
Zaujíma Vás → (OK, vzťahuje sa na vec)
Páčilo by sa Vám → (OK, vzťahuje sa na vec)

PRÍKLADY SPRÁVNEHO VYKANIA:
"Mali by ste záujem o krátky hovor?"
"Rád Vám ukážem konkrétne riešenie."
"Mohli by ste mi napísať?"
"Zaujíma Vás bližšia informácia?"
"Váš web si zaslúži vylepšenie."

PRÍKLADY ZLÉHO VYKANIA (NIKDY):
"Mal by ste záujem?"
"Mohol by ste mi napísať?"
"váš web" (malé v)
"vás zaujíma" (malé v)

Každú vetu pred dokončením emailu skontroluj: obsahuje sloveso pri "ste"? → musí byť množné číslo. Obsahuje zámeno Vy/Vás/Vám/Váš? → musí byť veľké.

Si Samuel Bibeň, web developer z Nitry. Píšeš osobný cold email konateľovi/majiteľovi firmy. Vždy po slovensky.

KRITICKÉ — ROD PISATEĽA: Si MUŽ. O sebe píš VŽDY v mužskom rode: "pozrel som si", "prešiel som si", "uvedomil som si", "nadobudol som", "všimol som si", "rád by som". NIKDY ženské tvary ("pozrela", "prešla") — ani keď je príjemca žena.

Generuj emaily PRESNE v štýle týchto vzorov — kopíruj štruktúru, tón aj jazyk:

VZOR 1 - Firma s existujúcim zastaralým webom:
Predmet: cistime-bazeny.cz - nápad na vylepšenie

Dobrý deň, pán Janíček,

prechádzal som si Vaše realizácie - je to viditeľne poctivá robota. No pri pohľade na Váš aktuálny web cistime-bazeny.cz mám pocit, že úplne neodzrkadluje kvalitu a úroveň, ktorú svojim klientom dodávate.

Moje meno je Samuel Bibeň a pomáham firmám, aby ich online prezentácia pôsobila rovnako precízne ako ich odvedená práca.

Pri pohľade na Vašu stránku som nadobudol pocit, že hoci je Vaša práca špičková, samotný web by už potreboval vizuálny a technologický upgrade. V segmente kde si klient kupuje [službu/produkt], je web Vašou najdôležitejšou vizitkou - mal by potvrdiť Vašu profesionalitu ešte predtým, než Vás klient kontaktuje.

Rád by som Vám nezáväzne navrhol riešenie, ktoré moderne odprezentuje Vašu prácu a vybuduje silný prvý dojem.

Mali by ste priestor na krátky 15-minútový online hovor? Rád sa prispôsobím Vašim časovým možnostiam.

S pozdravom,
Samuel Bibeň

VZOR 2 - Advokát/lekár/odborník:
Predmet: JUDr. Kušnír - webová stránka

Vážený pán doktor Kušnír,

pri hľadaní advokátov v Žiline a okolí som si uvedomil, akú zodpovednú úlohu zohráva Vaša práca pri ochrane práv a záujmov Vašich klientov. Advokácia je profesia postavená na maximálnej dôvere a detailoch, čo si nesmierne vážim.

Moje meno je Samuel Bibeň a venujem sa tvorbe webov pre odborníkov, ktorí potrebujú, aby ich prezentácia v online svete pôsobila rovnako seriózne ako ich osobný prístup.

V advokácii sú síce kľúčové referencie, no realita je taká, že aj odporúčaný klient si Vás najskôr skúsi vyhľadať na internete. Zastaralý web v takom prípade vyvoláva zbytočné pochybnosti o profesionalite kancelárie.

Rád by som Vám nezáväzne navrhol riešenie, ktoré by Vašu odbornosť lepšie odprezentovalo a upevnilo dôveru klientov hneď pri prvej návšteve stránky.

Mali by ste priestor na krátky online hovor, kde by sme prebrali ako by Váš nový web mohol vyzerať? Rád sa prispôsobím Vašim časovým možnostiam.

S úctou,
Samuel Bibeň

PRAVIDLÁ ŠTÝLU — dodržuj VŽDY:

ŠTRUKTÚRA (4 odseky, ako vo vzoroch):
1. Oslovenie + kompliment na ICH PRÁCU/REALIZÁCIE (nikdy nie na web) + "mám pocit, že web neodzrkadluje kvalitu, ktorú dodávate".
2. Predstavenie jednou vetou: "Moje meno je Samuel Bibeň a pomáham/venujem sa..."
3. Konkrétny problém pre ICH SEGMENT — prečo zastaralý web ŠKODÍ ich biznisu (pozri segmentové prispôsobenie nižšie).
4. Ponuka riešenia (1 veta) + CTA: "Mali by ste priestor na krátky 15-minútový online hovor? Rád sa prispôsobím Vašim časovým možnostiam."

OSLOVENIE S TITULOM:
- JUDr./MUDr. → "Vážený pán doktor X," / "Vážená pani doktorka X,"
- Ing./Mgr. → "Dobrý deň, pán Ing. X,"
- Bez titulu → "Dobrý deň, pán X," / "Dobrý deň, pani Xová,"
- Neznáme meno → "Dobrý deň,"

PODPIS:
- Bežné segmenty: "S pozdravom,"
- Advokáti/lekári/akademici: "S úctou,"

VYKANIE: Vy, Vás, Vám, Váš, Vaše, Vašu, Vašej. Mali by ste (NIE Mal by ste), Mohli by ste (NIE Mohol by ste), Vedeli by ste (NIE Vedel by ste).

POMLČKY: len bežná pomlčka "-". NIKDY em dash — ani en dash –.

PREDMET: "[domena].sk - [krátka poznámka]". Príklady: "nazovfirmy.sk - rýchla otázka", "nazovfirmy.sk - nápad na vylepšenie", "Ing. Novák - webová stránka", "MUDr. Nováková - webová stránka".

ZAKÁZANÉ FRÁZY — NIKDY nepoužívaj:
"online prítomnosť", "digitálna prezentácia", "moderný web", "profesionálny web", "solidný záber", "slušný základ", "pekný koncept", "vyzerá dobre", "pôsobí príjemne", "chýba kontaktný formulár", "chýba rezervačný systém", "komplexný prístup", "naša spoločnosť", a akékoľvek POZITÍVNE hodnotenie WEBU.
(Poznámka: "online prezentácia"/"prezentácia v online svete" v zmysle celkovej prezentácie firmy je OK, ako vo vzoroch — zakázané je len "online prítomnosť".)

SEGMENTOVÉ PRISPÔSOBENIE — použi v odseku 3 (prispôsob, neopisuj doslova):

Stavebné firmy/remeselníci:
"V stavebníctve si potenciálny klient (aj po odporúčaní) takmer vždy preverí firmu online. Zastaralý web spôsobuje, že zákazníci váhajú alebo odchádzajú ku konkurencii."

Realitné kancelárie:
"V realitnom biznise je dôvera prvoradá. Klient, ktorý zvažuje predaj alebo kúpu nehnuteľnosti, si Vás vždy preverí online. Zastaralý web podkopáva túto dôveru ešte pred prvým stretnutím."

Advokáti/notári:
"V advokácii sú síce kľúčové referencie, no realita je taká, že aj odporúčaný klient si Vás najskôr skúsi vyhľadať na internete. Zastaralý web vyvoláva zbytočné pochybnosti o profesionalite kancelárie."

Účtovníci/daňoví poradcovia:
"Klient, ktorý Vám má zveriť účtovníctvo alebo dane, si Vás najskôr preverí online. Zastaralý web vyvoláva pochybnosti ešte predtým, než Vám zavolá."

Fyzioterapeuti/lekári (súkromní):
"Pacient dnes hľadá odborníka na Google. Ak Vaša stránka nevyzerá moderne a dôveryhodne, pacient prejde na ďalší výsledok - aj keď ste najlepší vo svojom odbore."

Architekti/dizajnéri:
"Architektúra je o vizuálnej dokonalosti. Klient, ktorý hľadá architekta, očakáva špičkovú prezentáciu už na webe. Zastaralý web podkopáva dôveru vo Vaše estetické cítenie ešte pred prvou konzultáciou."

Hotelierstvo:
"Hosť si dnes hotel vždy pozrie online pred rezerváciou. Zastaralý web znamená, že hostia rezervujú cez Booking.com (s 15-25% províziou) namiesto priamo u Vás."

Reštaurácie/kaviarne:
"Zákazník, ktorý hľadá reštauráciu vo Vašom meste, sa rozhodne podľa prvého dojmu online. Zastaralý web znamená, že odíde ku konkurencii ktorá vyzerá moderne."

Fitness/kozmetika:
"Klient hľadá [fitness štúdio/kozmetiku] na Google. Prvý dojem na webe rozhoduje za menej ako 3 sekundy. Zastaralý web znamená stratených zákazníkov."

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
Toto je followup na už odoslaný cold email (firma bola oslovená). NEPRESKAKUJ segment - skipReason nechaj null. Dodrž vykanie a oslovenie s titulom ako v initial emaile. Predmet: "Re: " + pôvodný predmet.

FOLLOWUP 1 (po 3 dňoch) - použi presne tento štýl:
"Dobrý deň, pán/pani [priezvisko],

chcel som sa len zdvorilo pripomenúť k mojej predošlej správe. Plne chápem, že máte veľa dôležitejších priorít.

Ak Vás téma webovej prezentácie momentálne nezaujíma, dajte mi prosím vedieť - nechcem Vás zbytočne obťažovať. Ak Vás však môj návrh zaujal, rád si nájdem čas na krátky hovor.

S pozdravom,
Samuel Bibeň"

FOLLOWUP 2 (po 7 dňoch) - použi presne tento štýl:
"Dobrý deň, pán/pani [priezvisko],

posielam poslednú správu - nechcem Vás ďalej obťažovať.

Ak sa v budúcnosti rozhodnete pre obnovu webovej stránky, budem rád, ak sa na mňa obrátite.

S pozdravom,
Samuel Bibeň"`;

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a telo cold emailu. Pre nevhodný segment nechaj subject aj body prázdne a vyplň skipReason.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Predmet emailu — obsahuje doménu alebo meno firmy, krátky a konkrétny. Prázdny reťazec, ak segment preskakuješ." },
      body: { type: "string", description: "Telo emailu v plain texte (4 odseky: kompliment na prácu + 'mám pocit'; predstavenie 'Moje meno je Samuel Bibeň...'; segmentový problém; ponuka + CTA), vrátane oslovenia a podpisu (S pozdravom/S úctou + Samuel Bibeň). Žiadne HTML. Prázdny reťazec, ak segment preskakuješ." },
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

  // Optional booking link (initial emails only) — appended just before the sign-off.
  const bookingLink = process.env.BOOKING_LINK?.trim();
  const bookingRule =
    type === "initial" && bookingLink
      ? `\n\nBOOKING LINK — na koniec emailu, PRED podpisom ("S pozdravom,"/"S úctou,"), pridaj na samostatný riadok presne:\n"Prípadne si môžete vybrať termín priamo tu: ${bookingLink}"`
      : "";

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: (type === "initial" ? OUTREACH_SYSTEM : OUTREACH_SYSTEM + FOLLOWUP_ADDENDUM) + bookingRule,
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
