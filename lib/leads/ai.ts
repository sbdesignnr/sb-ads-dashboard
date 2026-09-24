import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";
import { buildGreeting } from "./person-name";
import { greetableOwnerName } from "./owner-source";
import { lintEmail } from "./email-quality";

const MODEL = "claude-sonnet-4-6";
// Model na písanie a na korektúru cold emailov. Dá sa prepísať env premennou
// (LEADS_EMAIL_MODEL / LEADS_PROOFREAD_MODEL) bez zásahu do kódu.
// Sonnet 5: na 6 reálnych leadoch písal tesnejšie a prirodzenejšie než 4.6 a správne
// preskočil nadnárodný koncern (STRABAG). Opus 5.5 často nevolal nástroj (3 z 6 bez výsledku).
const WRITER_MODEL = process.env.LEADS_EMAIL_MODEL?.trim() || "claude-sonnet-5";
// Korektúru robí najsilnejší model (jazyková presnosť je dôležitejšia než cena: 1 volanie
// na mail). Sonnet mal cyriliku ("часť") a "návštevníčok" v texte a nezachytil ich.
const PROOF_MODEL = process.env.LEADS_PROOFREAD_MODEL?.trim() || "claude-opus-5-5";

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
  visualIssues?: string[]; // AI-detected visual problems (screenshot analysis)
  visualReason?: string | null; // AI's overall visual impression
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

VIZUÁLNE HODNOTENIE (AI, zo screenshotu)
Celkový dojem: ${f.visualReason ?? "—"}
Vizuálne problémy:
${f.visualIssues && f.visualIssues.length ? f.visualIssues.map((i) => `- ${i}`).join("\n") : "- (žiadne konkrétne zistené)"}

TEXT Z WEBU (úryvok, home + kontakt/o-nás)
${f.pageText ? f.pageText.slice(0, 4500) : "(web sa nepodarilo načítať)"}`;
}

const DOSSIER_SYSTEM = `Si senior konzultant a obchodník SB Design (weby a digitálne riešenia na mieru, Slovensko). Dostaneš kompletné dáta o firme a jej webe. Priprav dôkladný podklad pre oslovenie – tak, aby obchodník presne vedel, KOHO, KEDY a AKO osloviť a čím firme reálne pomôžeme (a na čom zarobí).

Zásady:
- KONTAKTY (dôležité, NEVYMÝŠĽAJ): e-mail vyber IBA zo zoznamu "E-maily" nižšie – ak je prázdny, daj null. Telefón vyber IBA zo zoznamu "Telefóny" alebo z "Telefón (Google)" – inak null. NIKDY nevymýšľaj e-mail ani číslo. Meno osoby (ownerName) a jej rolu (ownerRole) NEURČUJ - vždy vráť null. Meno konateľa overujeme zvlášť v obchodnom registri; hádanie z textu webu vedie k zlému oslovovaniu.
- ANALÝZA (summary): 2–4 vety, MAX ~80 slov. Posúď stručne to najdôležitejšie – vek/modernosť dizajnu, responzívnosť, rýchlosť, konverzné prvky (rezervácia, formulár, CTA), SEO, dôveryhodnosť. Konkrétne, žiadna vata.
- PAIN: 1 najsilnejší pain point – čo to firmu reálne stojí (stratení klienti/rezervácie/tržby/dôvera/Google návštevnosť). Ak sa dá, naznač dopad – kvalitatívne (pozri pravidlo o číslach nižšie). Max ~50 slov.
- OPPORTUNITY: 1 konkrétna vec, ktorú postavíme, + ako mu pomôže zarobiť/ušetriť. Hmatateľné a relevantné pre jeho typ podnikania. Max ~50 slov.
- BEST CONTACT TIME: konkrétne dni + hodinové okno + krátky dôvod, podľa typu profesie. Max ~40 slov.
- OUTREACH ANGLE: aký tón a spôsob oslovenia zvoliť pri tomto človeku – prispôsob typu podnikania a titulu (advokát/lekár/odborník = formálne, vecne, s rešpektom k titulu; fitness tréner = uvoľnenejšie, energicky). Bez nátlaku. Toto pole slúži na nastavenie tónu a oslovenia v e-maile, preto NEPÍŠ hotové vety ani obsah e-mailu, len tón a spôsob oslovenia. Max ~40 slov.
- ČÍSLA A ODHADY (dôležité, NEVYMÝŠĽAJ): konkrétne čísla, sumy a odhady (cena za sedenie/službu, počet stratených klientov alebo objednávok, tržby, percentá, konverzia…) uveď IBA ak sa dajú odvodiť zo vstupných údajov – najmä zo sekcií "Zistené nedostatky" a "Vizuálne hodnotenie" a z technických údajov o webe (PageSpeed, vek webu…). Inak zostaň pri kvalitatívnom opise dôsledku (napr. "časť klientov si radšej vyberie konkurenciu") bez vymyslených čísel. Ak už musíš uviesť sumu alebo odhad, ktorý zo vstupov nevyplýva, výslovne ho označ ako "všeobecný trhový odhad" (nie údaj z ich webu). Platí pre VŠETKY polia (summary, painPoint, opportunity…).
- Píš po slovensky, vecne, bez marketingových fráz a superlatívov. VYPLŇ VŠETKY polia.

Ak je firma NEAKTÍVNA v registri, jasne to spomeň v summary (nemá zmysel ju oslovovať).

Výsledok vlož VÝHRADNE cez nástroj "uloz_dossier".`;

const DOSSIER_TOOL: Anthropic.Tool = {
  name: "uloz_dossier",
  description: "Uloží štruktúrovaný podklad k leadu.",
  input_schema: {
    type: "object",
    properties: {
      ownerName: { type: ["string", "null"], description: "VŽDY null - meno konateľa sa neurčuje z textu" },
      ownerRole: { type: ["string", "null"], description: "VŽDY null" },
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
    // Meno osoby sa z dossieru zámerne NEPREBERÁ (overuje sa v registri).
    ownerName: null,
    ownerRole: null,
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
O webe píš IBA to, čo CHÝBA alebo NEFUNGUJE — konkrétny fakt, nie kompliment.

KRITICKÉ PRAVIDLO — OSLOVENIE A PODPIS PRIDÁVA SYSTÉM:
Oslovenie ("Dobrý deň, pán ...") a podpis ("S pozdravom, Samuel Bibeň") do emailu vkladá systém sám — NEPÍŠ ich. Ty píšeš IBA odseky tela. Meno adresáta nepoznáš: nepoužívaj žiadne meno človeka, ani "pán/pani", ani slovo "konateľ" (ani ako oslovenie, ani ako označenie príjemcu). Firmu môžeš spomenúť názvom alebo doménou.

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

Si Samuel Bibeň, web developer z Nitry. Píšeš osobný cold email vedeniu firmy (majiteľovi/konateľovi), ale meno adresáta nepoznáš. Vždy po slovensky.

KRITICKÉ — ROD PISATEĽA: Si MUŽ. O sebe píš VŽDY v mužskom rode: "pozrel som si", "prešiel som si", "uvedomil som si", "nadobudol som", "všimol som si", "rád by som". NIKDY ženské tvary ("pozrela", "prešla") — ani keď je príjemca žena.

═══ ŠTRUKTÚRA EMAILU ═══

PREDMET: 2-4 slová, malými písmenami (nie Title Case, nie VEĽKÝMI PÍSMENAMI) — obsahuje názov firmy/doménu, alebo konkrétny nález, alebo oboje. NIKDY slová "ponuka", "spolupráca", "riešenie" (ani ich tvary) — krátky, vecný predmet písaný malými písmenami znie ako správa od človeka, nie ako marketing, a s väčšou pravdepodobnosťou sa vôbec otvorí. Príklady: "fyziocare.sk - rezervácie", "attorneity.com - rok 2017", "nápad k webu".

DĹŽKA A ROZDELENIE TELA: 50-100 slov, PRESNE 3 krátke odseky (1-2 vety každý) medzi oslovením a podpisom. Krátke odseky sa dajú prečítať na mobile jedným pohľadom — to je miesto, kde si cold email drvivá väčšina ľudí prvýkrát otvorí. (Prípadný riadok s odkazom na rezerváciu termínu sa do počtu slov nepočíta.)

ODSEK 1 — FAKT: jeden konkrétny, overiteľný nález o TEJTO firme, nie univerzálne tvrdenie, ktoré sedí na hocikoho. Vyber podľa priority (prvé dostupné vyhráva):
  1. rok/dátum v pätičke webu (copyright)
  2. PageSpeed skóre (mobil)
  3. konkrétna chýbajúca funkcia z "Ďalšie nedostatky webu" (napr. rezervácia/objednávka, schema.org, kontaktný formulár)
  4. subjektívny vizuálny dojem ("Vizuálne hodnotenie") — LEN ak nič objektívnejšie vyššie nie je k dispozícii (hodnota "—")
Fakt zabaľ do konkrétneho, mierne neočakávaného rámca namiesto suchého oznámenia ("web pôsobí zastarano" je veta, ktorú má napísanú už každý druhý cold email — nepoužívaj ju ani jej varianty). Priama vecná formulácia je tiež v poriadku, ale formuláciu obmieňaj — nekopíruj doslovne vzory nižšie ani vlastné predchádzajúce emaily v tejto kampani.

ODSEK 2 — DÔSLEDOK: jedna veta o tom, čo to firmu reálne stojí — použi "Pain point" z dát, ak je vyplnený (preformuluj ho do hlasu emailu, neopakuj doslovne); ak je prázdny (—), vychádzaj zo segmentového prispôsobenia nižšie. Voliteľne prirodzená zmienka o referencii z odboru — LEN ak je v dátach naozaj uvedená (momentálne nie je, takže túto vetu zvyčajne vynechaj, nevymýšľaj ju). SEM sa NEDÁVA konkrétne riešenie (rezervačný systém, nový web a pod.) — to je až na konzultácii; email má vzbudiť zvedavosť, nie sám predať riešenie.

ODSEK 3 — CTA: jedna nízko-záväzková otázka na názor/relevanciu (napr. "Sedí Vám tento pohľad?", "Čo na to hovoríte?", "Dáva Vám to zmysel?"). NIKDY priama žiadosť o hovor/stretnutie v tomto (prvom) emaile — žiadosť o názor stojí príjemcu oveľa menej než žiadosť o čas, a v odpovediach funguje výrazne lepšie.

VZORY (dĺžka, tón a štruktúra — slovník a rámec faktu obmieňaj, nekopíruj doslovne):

VZOR 1 - bežný segment (oslovenie a podpis pridá systém, ty píšeš len toto):
Predmet: fyziocare.sk - rezervácie

pri kontrole Vášho webu mi v pätičke vyskočil rok 2018 - fyzioterapia sa odvtedy predsa len niekam posunula.

Pre pacienta, ktorý si fyzioterapeuta vyberá podľa Google, to pôsobí ako dôvod skúsiť najprv niekoho iného.

Sedí Vám tento pohľad, alebo to vidíte inak?

VZOR 2 - odborník (advokát/lekár; formálnosť tónu riadi oslovenie, ktoré pridá systém):
Predmet: akchocholousek.cz - kontakt online

na Vašom webe som nenašiel žiadny spôsob, ako Vás osloviť inak než telefonicky - ani formulár, ani priamy e-mail.

Klient, ktorý advokáta hľadá mimo pracovnej doby, sa v tej chvíli nemá ako ozvať a skúsi to inde.

Dáva Vám tento pohľad zmysel?

TÓN: prvý odsek začína rovno vetou (bez "Dobrý deň", bez mena) — oslovenie je nad ním. Oslovenie končí čiarkou, preto prvý odsek začni MALÝM písmenom ("pri kontrole Vášho webu…", "na strabag.sk som nenašiel…"), okrem vlastného mena, značky alebo domény. Formálnosť tónu prispôsob údaju "Tón oslovenia" v dátach (formálny = vecnejší a uctivejší, bežný = uvoľnenejší; vykanie platí vždy).

VYKANIE: Vy, Vás, Vám, Váš, Vaše, Vašu, Vašej. Mali by ste (NIE Mal by ste), Mohli by ste (NIE Mohol by ste), Vedeli by ste (NIE Vedel by ste).

POMLČKY: len bežná pomlčka "-". NIKDY em dash — ani en dash –.

ČÍSLA A ODHADY: žiadne čísla/sumy/odhady, ktoré nie sú doslovne odvoditeľné zo vstupných dát (PageSpeed, rok, konkrétny nedostatok). Surové skóre/čísla z analýzy necituj priamo (nepíš "PageSpeed 36/100"), opíš dôsledok slovami. NEPOČÍTAJ ani neodhaduj počet rokov, mesiacov ani iné počty - ani slovom ("sedem rokov", "desaťročie", "polovica"): uveď iba rok z pätičky presne tak, ako je v dátach (napr. "v pätičke je rok 2018"). Ak je nevyhnutný všeobecný trhový odhad, musí byť explicitne označený ako odhad, nie ako údaj z ich webu. Nepridávaj ani mieru dopadu, ktorú dáta nepodporujú — ak dáta hovoria "časť klientov" alebo "niektorí", nepíš "väčšina" ani "všetci".

TVRDÝ BLOCKLIST — tieto frázy a vzory NIKDY nepoužiješ, bez výnimky:
- "všimol som si, že váš web pôsobí zastarano" (ani žiadny variant tejto vety)
- "chceli by sme vám pomôcť s vylepšením online prezentácie"
- "sme tím odborníkov/agentúra špecializujúca sa na..."
- "v dnešnej dobe je dôležité mať moderný web"
- "dovoľujeme si Vás osloviť"

ĎALŠIE FRÁZY, KTORÝM SA VYHNI (rovnaký dôvod — znejú ako hromadný spam):
"online prítomnosť", "digitálna prezentácia", "moderný web", "profesionálny web", "solidný záber", "slušný základ", "pekný koncept", "vyzerá dobre", "pôsobí príjemne", "chýba kontaktný formulár", "chýba rezervačný systém", "komplexný prístup", "naša spoločnosť", a akékoľvek POZITÍVNE hodnotenie WEBU.
(Poznámka: "online prezentácia"/"prezentácia v online svete" v zmysle celkovej prezentácie firmy je OK — zakázané je len "online prítomnosť".)

SEGMENTOVÉ PRISPÔSOBENIE — záložný zdroj pre ODSEK 2, len keď "Pain point" chýba (prispôsob, neopisuj doslova):

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
- Nikdy nevymýšľaj fakty o firme; ak nepoznáš konkrétny problém z analýzy, drž sa všeobecného tónu segmentového prispôsobenia.
- Ak firma nemá web (Web: —), ODSEK 1 postav na fakte, že firma nemá vlastnú webovú stránku (nie na hádaní jej obsahu).
- Email musí znieť ako keby si ho napísal ručne, nie ako AI šablóna.

Výsledok vždy vlož VÝHRADNE cez nástroj "uloz_email".`;

// The system prompt above is for the INITIAL cold email. Followups reuse the
// same persona/style but each step needs its own content source + CTA rule —
// per-type addendum, selected by generateOutreachEmail.
const FOLLOWUP_TYPES = ["followup1", "followup2", "followup3"] as const;
type FollowupType = (typeof FOLLOWUP_TYPES)[number];

function followupAddendum(type: FollowupType): string {
  const common = `

--- REŽIM FOLLOWUP ---
Toto je followup na už odoslaný cold email (firma bola oslovená). NEPRESKAKUJ segment - skipReason nechaj null. Dodrž vykanie. Oslovenie a podpis pridá systém - nepíš ich. Predmet: "Re: " + pôvodný predmet (dostaneš ho v inštrukcii).
Nižšie v dátach je sekcia "PREDCHÁDZAJÚCE EMAILY V TOMTO VLÁKNE" — každý krok MUSÍ priniesť INÝ fakt/uhol než tie predošlé, nikdy nie tú istú vetu inak sformulovanú. To je hlavný dôvod, prečo sekvencie followupov zvyčajne zlyhávajú.`;

  if (type === "followup1")
    return `${common}

FOLLOWUP 1 (po 2-3 dňoch): krátke pripomenutie (1-2 vety) + JEDEN INÝ konkrétny nález zo "Ďalšie nedostatky webu" (alebo "Hlavné vizuálne problémy"), ktorý sa v predchádzajúcom emaile ešte nepoužil. Zakonči rovnakým typom mäkkého CTA ako v initial emaile (otázka na názor/relevanciu, nie žiadosť o hovor). Cieľ ~40-70 slov, 2 krátke odseky + CTA.`;

  if (type === "followup2")
    return `${common}

FOLLOWUP 2 (po 4-5 dňoch): INÝ UHOL než v predošlých dvoch emailoch - namiesto ďalšieho technického nálezu popíš dôsledok/perspektívu z pohľadu KLIENTA/PACIENTA danej firmy (vychádzaj zo SEGMENTOVÉ PRISPÔSOBENIE vyššie, sformuluj vlastnými slovami, nekopíruj). Zakonči mäkkým CTA. Cieľ ~40-70 slov, 2 krátke odseky + CTA.`;

  return `${common}

FOLLOWUP 3 (po 5-7 dňoch), posledný v sekvencii: zdvorilé ZATVORENIE bez akéhokoľvek CTA — nepýtaj sa na nič, len oznám, že toto je posledná správa, a nechaj dvere otvorené (nech sa ozvú, keď to bude aktuálne). Neopakuj fakty z predošlých emailov. Krátke, ~30-50 slov, žiadna otázka na konci.`;
}

// Appended to the INITIAL-email system prompt when the lead already has an AI
// brief ("Príležitosť (AI)"). The brief is a finished input for ODSEK 2 a tón —
// ODSEK 1 (fakt podľa priority) sa nemení, ten platí vždy rovnako.
const BRIEF_ADDENDUM = `

--- REŽIM: HOTOVÝ PODKLAD Z ANALÝZY ---
V dátach je sekcia "HOTOVÝ PODKLAD Z ANALÝZY" (Kde firma stráca / Ako osloviť). Je to hotový vstup, ktorý už prešiel analýzou práve tejto firmy. NEODVODZUJ nezávisle vlastný dôsledok ani vlastný tón - postav email z neho:
- ODSEK 2 (dôsledok) postav z "Kde firma stráca": zachovaj jeho vecný obsah, ale preformuluj ho do hlasu emailu (vykanie, 1 plynulá veta). Segmentové prispôsobenie vyššie použi IBA ak je "Kde firma stráca" prázdne (—).
- TÓN nastav podľa "Ako osloviť": formálny/odborný (odborník, titul, rešpekt) = vecnejší a uctivejší; vecný/bežný = uvoľnenejší. Oslovenie a podpis pridá systém - nepíš ich. Vykanie ostáva vždy, aj pri uvoľnenejšom tóne.
- Podklad môže obsahovať frázy, ktoré sú v emaile ZAKÁZANÉ (napr. "moderný web", "profesionálny web", "online prítomnosť"). Nikdy ich neprevezmi doslova - pri preformulovaní ich nahraď vecným opisom (napr. "nový web s online objednávaním").
- Z "Ako osloviť" preber IBA tón a spôsob oslovenia - nekopíruj z neho vety ani štruktúru. Ak podklad hodnotí web pozitívne, túto časť ignoruj (pravidlo o hodnotení webu má vždy prednosť).
- NEPRIDÁVAJ NIČ NAD PODKLAD: nevymýšľaj tvrdenia o správaní firmy (napr. že nezdvíhajú telefón) ani mieru dopadu (napr. "väčšina klientov odíde", "polovica dopytov"). Drž sa miery z podkladu - ak tam je "časť klientov" alebo "niektorí", nepíš "väčšina".
- "Čo ponúknuť" je v dátach len pre kontext - konkrétne riešenie sa do emailu podľa štruktúry vyššie nedáva (to je až na konzultácii), takže toto pole v tele emailu nepoužívaj.`;

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a odseky tela cold emailu (BEZ oslovenia a podpisu - tie pridá systém). Pre nevhodný segment nechaj subject aj paragraphs prázdne a vyplň skipReason.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Predmet emailu — 2-4 slová, malými písmenami, obsahuje doménu/názov firmy alebo konkrétny nález. Nikdy 'ponuka'/'spolupráca'/'riešenie'. Prázdny reťazec, ak segment preskakuješ." },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        description: "Odseky tela v poradí. Initial email: PRESNE 3 krátke odseky (fakt / dôsledok / mäkké CTA), spolu 50-100 slov. Followup: pozri REŽIM FOLLOWUP. BEZ oslovenia ('Dobrý deň'), BEZ podpisu, BEZ mena adresáta. Prázdne pole, ak segment preskakuješ.",
      },
      skipReason: { type: ["string", "null"], description: "Ak segment nie je vhodný na cold outreach, dôvod; inak null." },
    },
    required: ["subject", "paragraphs"],
  } as Anthropic.Tool.InputSchema,
};

const PROOFREAD_SYSTEM = `Si jazykový redaktor slovenčiny a kontrolór kvality obchodných e-mailov. Dostaneš návrh cold emailu (predmet + odseky) a DÁTA O FIRME, z ktorých smel autor čerpať. Skontroluj a oprav:

1. PRAVOPIS A GRAMATIKA: y/i po tvrdých a mäkkých spoluhláskach, ľ/l, ä/e, ô, mäkčene, veľké písmená, skloňovanie a pády, zhoda podmetu s prísudkom, predložkové väzby, čiarky (pred že, ktorý, aby, keď, pretože…), rod a číslo.
2. VYKANIE: pri "Vy" množné číslo slovies a príčastí ("Mali by ste", "Boli ste", "Ste presvedčení"), zámená Vy/Vás/Vám/Váš/Vaše/Vašu/Vašej/Vašich VŽDY s veľkým začiatočným písmenom.
3. ŠTYLISTIKA: prirodzená, správna slovenčina; žiadne kalky z češtiny alebo angličtiny ("vzhľadom k", "web stránka", "zdá se"), žiadne nemotorné alebo strojové obraty; správna terminológia (webová stránka, rezervácia, objednávanie, mobilné zariadenia). Pisateľ je MUŽ ("pozrel som", "všimol som si").
4. PRAVDIVOSŤ: každé tvrdenie o firme/webe musí vyplývať z DÁT; nič nesmie byť vymyslené, zveličené ani zosilnené (ak dáta hovoria "časť klientov", nesmie tam byť "väčšina"). Čísla, percentá a sumy mimo dát sú zakázané (povolený je iba rok z pätičky webu).
5. Pomlčky: iba obyčajná "-", nikdy — ani –.

VÝNIMKA: prvý odsek sa ZÁMERNE začína malým písmenom (nadväzuje na oslovenie zakončené čiarkou, ktoré pridá systém) - to NIE je chyba, nemeň to. Riadok predmetu je zámerne písaný malými písmenami.

PRAVIDLÁ ÚPRAV: Oprav MINIMÁLNE. Zachovaj počet odsekov, zmysel, tón a približnú dĺžku. Nepridávaj oslovenie ani podpis ani meno adresáta. Nepridávaj nové fakty. Ak je text v poriadku, vráť verdikt "ok" a text nezmeň.
Ak sa problém nedá opraviť bez prepísania emailu (nepravdivé/vymyslené tvrdenie, nezrozumiteľný text), vráť verdikt "reject" a v "problems" stručne uveď dôvod.

Výsledok vlož VÝHRADNE cez nástroj "uloz_korekturu".`;

interface ProofResult {
  verdict: "ok" | "fixed" | "reject";
  subject: string;
  paragraphs: string[];
  problems: string[];
}

/**
 * AI jazykový korektor. Výsledok berie ako čistý JSON v texte (nie cez nástroj) —
 * silnejšie modely (Opus) vynútený tool_choice nepodporujú a nástroj občas nezavolajú.
 */
export async function proofread(
  client: Anthropic,
  facts: string,
  subject: string,
  paragraphs: string[],
): Promise<ProofResult | null> {
  const msg = await createMessage(client, {
    model: PROOF_MODEL,
    max_tokens: 1200,
    temperature: 0,
    system:
      PROOFREAD_SYSTEM.replace(
        'Výsledok vlož VÝHRADNE cez nástroj "uloz_korekturu".',
        'Odpovedz VÝHRADNE jedným JSON objektom (žiadny iný text, žiadny markdown): {"verdict":"ok"|"fixed"|"reject","subject":"…","paragraphs":["…"],"problems":["…"]}',
      ),
    messages: [
      {
        role: "user",
        content: `DÁTA O FIRME:\n${facts}\n\nNÁVRH EMAILU:\nPredmet: ${subject}\n\n${paragraphs.map((p, i) => `Odsek ${i + 1}: ${p}`).join("\n\n")}`,
      },
    ],
  });
  const m = textFrom(msg).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<ProofResult>;
    if (j.verdict !== "ok" && j.verdict !== "fixed" && j.verdict !== "reject") return null;
    return {
      verdict: j.verdict,
      subject: typeof j.subject === "string" ? j.subject : subject,
      paragraphs: Array.isArray(j.paragraphs) ? j.paragraphs.map(String) : paragraphs,
      problems: Array.isArray(j.problems) ? j.problems.map(String) : [],
    };
  } catch {
    return null;
  }
}

export interface OutreachEmail {
  subject: string;
  body: string;
  skipReason: string | null; // set when the segment isn't worth cold-emailing
}

/** Mail neprešiel kontrolou kvality ani po opakovaných pokusoch — NESMIE sa uložiť ani odoslať. */
export class EmailQualityError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Email nespĺňa kontrolu kvality: ${issues.slice(0, 3).join("; ")}`);
    this.name = "EmailQualityError";
  }
}

/** One earlier e-mail in the same thread, for the "don't repeat this" context. */
export interface ThreadEmail {
  type: string; // "initial" | "followup1" | "followup2" | "followup3"
  subject: string;
  body: string;
}

const THREAD_LABEL: Record<string, string> = {
  initial: "PRVÝ EMAIL",
  followup1: "FOLLOWUP 1",
  followup2: "FOLLOWUP 2",
  followup3: "FOLLOWUP 3",
};

// Segmenty, kde sa píše formálne ("S úctou") aj bez titulu v mene.
const FORMAL_SEGMENT_RE = /advok|notár|lekár|zubn|doktor|ordinác|akadem|právn|exekút|súdn/i;

// Novšie modely majú iné obmedzenia API (napr. Sonnet 5 odmieta `temperature`, Opus 5.5
// odmieta vynútený `tool_choice`). Volanie sa pri takejto chybe raz upraví a model
// sa zapamätá — zmena modelu cez env premennú tak nezastaví generovanie mailov.
const modelQuirks = new Map<string, { noTemperature?: boolean; autoToolChoice?: boolean }>();

async function createMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const quirks = modelQuirks.get(params.model) ?? {};
  for (let i = 0; i < 3; i++) {
    const p = { ...params };
    if (quirks.noTemperature) delete p.temperature;
    if (quirks.autoToolChoice && p.tool_choice?.type === "tool") p.tool_choice = { type: "auto" };
    try {
      return await client.messages.create(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!quirks.noTemperature && /temperature/i.test(msg) && /deprecated|not supported|unsupported/i.test(msg)) {
        quirks.noTemperature = true;
      } else if (!quirks.autoToolChoice && /tool_choice/i.test(msg)) {
        quirks.autoToolChoice = true;
      } else {
        throw e;
      }
      modelQuirks.set(params.model, quirks);
    }
  }
  return client.messages.create(params);
}

/** Em/en pomlčka → obyčajná "-" (špecifikácia povoľuje len "-"); radšej opraviť než mail zamietnuť. */
function normalizeDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, " - ")
    // Slovenské úvodzovky „…" namiesto rovných "…" a anglických “…”.
    .replace(/"([^"\n]+)"/g, "„$1“")
    .replace(/[“”]([^“”\n]+)[“”]/g, "„$1“");
}

function textFrom(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// Slová, ktoré sa na začiatku odseku NIKDY nezmenšujú: zámená pri vykaní a známe značky/mestá.
const KEEP_CAPITAL = new Set([
  "Vy", "Vás", "Vám", "Váš", "Vaša", "Vaše", "Vašu", "Vašej", "Vašich", "Vaším", "Vaši",
  "Vašim", "Vašimi", "Vami", "Vašom", "Vášho", "Vašou",
  "Google", "Facebook", "Instagram", "WordPress", "Shoptet", "Wix", "PageSpeed", "Booking",
  "Airbnb", "Slovensko", "Česko", "Bratislava", "Nitra", "Košice", "Žilina", "Praha", "Brno",
  "Trnava", "Prešov", "Banská", "Poprad",
]);

/**
 * Prvý odsek nadväzuje na oslovenie s čiarkou ("Dobrý deň, pán Novák," → "pri
 * kontrole…"), takže začiatočné slovo sa píše malým písmenom — okrem zámen
 * Vy/Váš…, značiek, miest a názvu firmy. Mení len obyčajné slovo s veľkým
 * začiatočným písmenom (domény, skratky a zmiešané zápisy nechá).
 */
function lowerOpener(paragraph: string, companyName: string): string {
  const m = paragraph.match(/^(\p{Lu}\p{Ll}*)(?=[\s,])/u);
  if (!m) return paragraph;
  const word = m[1];
  if (KEEP_CAPITAL.has(word)) return paragraph;
  const company = new Set(
    companyName.split(/[\s,.|&/-]+/).filter(Boolean).map((t) => t.toLowerCase()),
  );
  if (company.has(word.toLowerCase())) return paragraph;
  return word.toLowerCase() + paragraph.slice(word.length);
}

/** Skladá finálny plain-text mail: oslovenie (z kódu) + odseky + [booking] + podpis. */
function assembleBody(opts: {
  greeting: string;
  paragraphs: string[];
  signoff: string;
  bookingLine?: string;
}): string {
  return [
    opts.greeting,
    ...opts.paragraphs.map((p) => p.trim()),
    ...(opts.bookingLine ? [opts.bookingLine] : []),
    `${opts.signoff}\nSamuel Bibeň`,
  ].join("\n\n");
}

/**
 * Generate an initial cold email or a follow-up as { subject, body }.
 *
 * Postup: (1) model napíše LEN odseky (oslovenie a podpis skladá kód z OVERENÉHO
 * mena — nikdy z odhadu modelu), (2) deterministická kontrola pravidiel
 * (vykanie, zakázané frázy, čísla, dĺžka…), (3) AI jazykový korektor, (4) znova
 * kontrola. Pri chybe sa model pokúsi znova s konkrétnou spätnou väzbou (max. 3
 * pokusy); ak ani potom mail nesedí, vyhodí EmailQualityError — zlý mail sa
 * nikdy neuloží.
 */
export async function generateOutreachEmail(input: {
  lead: Lead;
  segmentName: string;
  type: "initial" | FollowupType;
  /** Earlier e-mails in this thread, chronological — so a followup can avoid repeating a fact/angle already used. */
  previousEmails?: ThreadEmail[];
}): Promise<OutreachEmail> {
  const { lead, segmentName, type } = input;
  const previousEmails = input.previousEmails ?? [];

  // Oslovenie: meno sa použije LEN ak je overené (register/web/ručne).
  const greeting = buildGreeting(greetableOwnerName(lead));
  const formal = greeting.formal || FORMAL_SEGMENT_RE.test(segmentName);
  const signoff = formal ? "S úctou," : "S pozdravom,";

  // Initial email of a lead that already has an AI brief → the brief drives
  // ODSEK 2 (dôsledok) a tón; ODSEK 1 (fakt) sa riadi vždy tou istou prioritou.
  const useBrief = type === "initial" && Boolean(lead.aiPainPoint?.trim());

  const briefBlock = useBrief
    ? `
HOTOVÝ PODKLAD Z ANALÝZY (použi ako vstup pre odsek 2 a tón, neodvodzuj vlastný):
Kde firma stráca: ${lead.aiPainPoint?.trim() || "—"}
Čo ponúknuť (len kontext, nepoužívaj v tele emailu): ${lead.aiOpportunity?.trim() || "—"}
Ako osloviť (len tón a oslovenie): ${lead.aiOutreachAngle?.trim() || "—"}`
    : `
Pain point: ${lead.aiPainPoint ?? "—"}`;

  const threadBlock = previousEmails.length
    ? `\n\nPREDCHÁDZAJÚCE EMAILY V TOMTO VLÁKNE (nepoužívaj rovnaký fakt/uhol ako tu):\n${previousEmails
        .map(
          (e) =>
            `--- ${THREAD_LABEL[e.type] ?? e.type} ---\nPredmet: ${e.subject}\n${e.body}`,
        )
        .join("\n\n")}`
    : "";

  // Rok v pätičke je nedostatok len ak je naozaj starý; aktuálny/nedávny rok model
  // nesmie spomenúť ("v pätičke je už rok 2026" je nezmysel).
  const staleYear =
    lead.copyrightYear && lead.copyrightYear <= new Date().getFullYear() - 2
      ? lead.copyrightYear
      : null;

  // Meno adresáta MODEL NEDOSTÁVA (oslovenie robí kód) — nemá ako ho použiť zle.
  const facts = `DÁTA O FIRME (použi konkrétne, nevymýšľaj; surové skóre/čísla z analýzy necituj):
Firma: ${lead.companyName}
Segment (odvetvie): ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Tón oslovenia: ${formal ? "formálny (odborník / uctivý tón)" : "bežný (vecný, priateľský, stále vykanie)"}
Rok v pätičke webu (copyright): ${staleYear ?? "—"}
PageSpeed mobil: ${lead.pageSpeedMobile != null ? `${lead.pageSpeedMobile}/100` : "—"}
Vizuálny dojem (AI): ${lead.aiVisualReason ?? "—"}
Hlavné vizuálne problémy: ${(lead.visualIssues ?? []).slice(0, 4).join("; ") || "—"}
Ďalšie nedostatky webu: ${(lead.websiteIssues ?? []).slice(0, 5).join("; ") || "—"}${briefBlock}
Zhrnutie stavu webu: ${lead.aiSummary ?? "—"}${threadBlock}`;

  // Roky, ktoré sa smú v maile objaviť, lebo sú v dátach (napr. "copyright 2015").
  const allowedYears = [...facts.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map((m) => Number(m[0]));

  const initialSubject = previousEmails[0]?.subject || lead.companyName;
  const instruction =
    type === "initial"
      ? "Napíš PRVÝ (initial) cold email podľa štruktúry a pravidiel. Nepíš oslovenie ani podpis."
      : `Napíš ${THREAD_LABEL[type]} (len odseky, bez oslovenia a podpisu). Predmet: "Re: ${initialSubject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}".`;

  // Optional booking link (initial emails only) — appended by code before the sign-off.
  const bookingLink = process.env.BOOKING_LINK?.trim();
  const bookingLine =
    type === "initial" && bookingLink
      ? `Prípadne si môžete vybrať termín priamo tu: ${bookingLink}`
      : undefined;

  const system =
    type === "initial"
      ? OUTREACH_SYSTEM + (useBrief ? BRIEF_ADDENDUM : "")
      : OUTREACH_SYSTEM + followupAddendum(type);

  const client = new Anthropic();
  const MAX_ATTEMPTS = 3;
  let feedback: string[] = [];
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const retryNote = feedback.length
      ? `\n\nPREDCHÁDZAJÚCI POKUS BOL ZAMIETNUTÝ z týchto dôvodov - oprav ich a dodrž VŠETKY pravidlá:\n${feedback.map((f) => `- ${f}`).join("\n")}`
      : "";

    // 1) písanie
    const msg = await createMessage(client, {
      model: WRITER_MODEL,
      max_tokens: 800,
      temperature: 0.6,
      system,
      tools: [OUTREACH_TOOL],
      tool_choice: { type: "tool", name: "uloz_email" },
      messages: [{ role: "user", content: `${facts}\n\n${instruction}${retryNote}` }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const d = (block?.input ?? {}) as {
      subject?: string;
      paragraphs?: unknown;
      skipReason?: string | null;
    };
    if (d.skipReason)
      return { subject: "", body: "", skipReason: String(d.skipReason).trim() };

    let subject = normalizeDashes((d.subject ?? "").trim()).slice(0, 120);
    let paragraphs = Array.isArray(d.paragraphs)
      ? d.paragraphs.map((p) => normalizeDashes(String(p).trim())).filter(Boolean)
      : [];

    const lint = (subj: string, paras: string[]) =>
      lintEmail({
        kind: type,
        subject: subj,
        paragraphs: paras,
        copyrightYear: staleYear,
        allowedYears,
      });

    // 2) tvrdé pravidlá
    let res = lint(subject, paragraphs);
    if (res.errors.length) {
      lastIssues = res.errors;
      feedback = res.errors;
      continue;
    }

    // 3) jazyková korektúra (AI). Nedostupná/nezrozumiteľná korektúra mail NEPUSTÍ
    // ďalej — bez nej by sa preklepy (napr. cyrilika) dostali k adresátovi.
    const pr = await proofread(client, facts, subject, paragraphs);
    if (!pr) {
      lastIssues = ["korektúra nevrátila použiteľný výsledok"];
      feedback = [];
      continue;
    }
    if (pr.verdict === "reject") {
      lastIssues = pr.problems.length ? pr.problems : ["korektor mail zamietol"];
      feedback = lastIssues;
      continue;
    }
    if (pr.verdict === "fixed") {
      const fixedParas = pr.paragraphs.map((p) => normalizeDashes(p.trim())).filter(Boolean);
      // Korektor nesmie meniť štruktúru (počet odsekov).
      if (fixedParas.length === paragraphs.length) {
        paragraphs = fixedParas;
        if (type === "initial" && pr.subject.trim()) subject = normalizeDashes(pr.subject.trim()).slice(0, 120);
      }
    }

    // 4) po korektúre znova tvrdé pravidlá
    res = lint(subject, paragraphs);
    if (res.errors.length) {
      lastIssues = res.errors;
      feedback = res.errors;
      continue;
    }

    return {
      subject,
      body: assembleBody({
        greeting: greeting.line,
        paragraphs: [lowerOpener(paragraphs[0], lead.companyName), ...paragraphs.slice(1)],
        signoff,
        bookingLine,
      }),
      skipReason: null,
    };
  }

  throw new EmailQualityError(lastIssues);
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
