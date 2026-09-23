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
- KONTAKTY (dôležité, NEVYMÝŠĽAJ): e-mail vyber IBA zo zoznamu "E-maily" nižšie – ak je prázdny, daj null. Telefón vyber IBA zo zoznamu "Telefóny" alebo z "Telefón (Google)" – inak null. NIKDY nevymýšľaj e-mail ani číslo. Meno majiteľa/konateľa urči z textu webu alebo ORSR (uprednostni konkrétnu osobu pred generickým info@); ak sa nedá, null.
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
O webe píš IBA to, čo CHÝBA alebo NEFUNGUJE — konkrétny fakt, nie kompliment.

KRITICKÉ PRAVIDLO — MENO KONTAKTU:
Meno v "Konateľ/kontakt" použi PRESNE tak, ako je v dátach — aj keď vyzerá, že mu chýba diakritika (napr. "Gabris", "Zatecka"). NIKDY nedopĺňaj ani nehádaj diakritiku (nie "Gabriš", nie "Gabrís"). Meno bez diakritiky pôsobí neutrálne; nesprávne domyslená diakritika vyzerá ako preklep a prezradí automatizáciu presvedčivejšie než čokoľvek iné. Ak meno nepoznáš, nevymýšľaj ho — použi oslovenie bez mena podľa tabuľky nižšie.

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

VZOR 1 - bežný segment:
Predmet: fyziocare.sk - rezervácie

Dobrý deň, pán Novák,

pri kontrole Vášho webu mi v pätičke vyskočil rok 2018 - fyzioterapia sa odvtedy predsa len niekam posunula.

Pre pacienta, ktorý si fyzioterapeuta vyberá podľa Google, to pôsobí ako dôvod skúsiť najprv niekoho iného.

Sedí Vám tento pohľad, alebo to vidíte inak?

S pozdravom,
Samuel Bibeň

VZOR 2 - odborník/titul:
Predmet: akchocholousek.cz - kontakt online

Vážený pán doktor Chocholoušek,

na Vašom webe som nenašiel žiadny spôsob, ako Vás osloviť inak než telefonicky - ani formulár, ani priamy e-mail.

Klient, ktorý advokáta hľadá mimo pracovnej doby, sa v tej chvíli nemá ako ozvať a skúsi to inde.

Dáva Vám tento pohľad zmysel?

S úctou,
Samuel Bibeň

OSLOVENIE S TITULOM:
- JUDr./MUDr. → "Vážený pán doktor X," / "Vážená pani doktorka X,"
- Ing./Mgr. → "Dobrý deň, pán Ing. X,"
- Bez titulu → "Dobrý deň, pán X," / "Dobrý deň, pani Xová,"
- Neznáme meno → "Dobrý deň," (nikdy nevymýšľaj meno len preto, aby oslovenie nebolo generické)

PODPIS:
- Bežné segmenty: "S pozdravom,"
- Advokáti/lekári/akademici: "S úctou,"

VYKANIE: Vy, Vás, Vám, Váš, Vaše, Vašu, Vašej. Mali by ste (NIE Mal by ste), Mohli by ste (NIE Mohol by ste), Vedeli by ste (NIE Vedel by ste).

POMLČKY: len bežná pomlčka "-". NIKDY em dash — ani en dash –.

ČÍSLA A ODHADY: žiadne čísla/sumy/odhady, ktoré nie sú doslovne odvoditeľné zo vstupných dát (PageSpeed, rok, konkrétny nedostatok). Surové skóre/čísla z analýzy necituj priamo (nepíš "PageSpeed 36/100"), opíš dôsledok slovami. Ak je nevyhnutný všeobecný trhový odhad, musí byť explicitne označený ako odhad, nie ako údaj z ich webu. Nepridávaj ani mieru dopadu, ktorú dáta nepodporujú — ak dáta hovoria "časť klientov" alebo "niektorí", nepíš "väčšina" ani "všetci".

TVRDÝ BLOCKLIST — tieto frázy a vzory NIKDY nepoužiješ, bez výnimky:
- "všimol som si, že váš web pôsobí zastarano" (ani žiadny variant tejto vety)
- "chceli by sme vám pomôcť s vylepšením online prezentácie"
- "sme tím odborníkov/agentúra špecializujúca sa na..."
- "v dnešnej dobe je dôležité mať moderný web"
- "dovoľujeme si Vás osloviť"
- generický pozdrav bez mena, keď je meno v dátach dostupné

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
Toto je followup na už odoslaný cold email (firma bola oslovená). NEPRESKAKUJ segment - skipReason nechaj null. Dodrž vykanie a oslovenie s titulom ako v initial emaile. Predmet: "Re: " + pôvodný predmet (dostaneš ho v inštrukcii).
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
- TÓN A OSLOVENIE nastav podľa "Ako osloviť": formálny/odborný tón (odborník, titul, rešpekt) = formálny variant oslovenia z tabuľky ("Vážený pán/Vážená pani ...") a podpis "S úctou,"; vecný/bežný tón = "Dobrý deň, pán/pani ..." a podpis "S pozdravom,". Vykanie ostáva vždy, aj pri uvoľnenejšom tóne.
- Podklad môže obsahovať frázy, ktoré sú v emaile ZAKÁZANÉ (napr. "moderný web", "profesionálny web", "online prítomnosť"). Nikdy ich neprevezmi doslova - pri preformulovaní ich nahraď vecným opisom (napr. "nový web s online objednávaním").
- Z "Ako osloviť" preber IBA tón a spôsob oslovenia - nekopíruj z neho vety ani štruktúru. Ak podklad hodnotí web pozitívne, túto časť ignoruj (pravidlo o hodnotení webu má vždy prednosť).
- NEPRIDÁVAJ NIČ NAD PODKLAD: nevymýšľaj tvrdenia o správaní firmy (napr. že nezdvíhajú telefón) ani mieru dopadu (napr. "väčšina klientov odíde", "polovica dopytov"). Drž sa miery z podkladu - ak tam je "časť klientov" alebo "niektorí", nepíš "väčšina".
- "Čo ponúknuť" je v dátach len pre kontext - konkrétne riešenie sa do emailu podľa štruktúry vyššie nedáva (to je až na konzultácii), takže toto pole v tele emailu nepoužívaj.`;

const OUTREACH_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a telo cold emailu. Pre nevhodný segment nechaj subject aj body prázdne a vyplň skipReason.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Predmet emailu — 2-4 slová, malými písmenami, obsahuje doménu/názov firmy alebo konkrétny nález. Nikdy 'ponuka'/'spolupráca'/'riešenie'. Prázdny reťazec, ak segment preskakuješ." },
      body: { type: "string", description: "Telo emailu v plain texte: oslovenie; PRESNE 3 krátke odseky (fakt / dôsledok / mäkké CTA) pre initial email — pre followup pozri REŽIM FOLLOWUP; podpis (S pozdravom/S úctou + Samuel Bibeň). 50-100 slov tela pre initial email. Žiadne HTML. Prázdny reťazec, ak segment preskakuješ." },
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

/** Generate an initial cold email or a follow-up as { subject, body }. */
export async function generateOutreachEmail(input: {
  lead: Lead;
  segmentName: string;
  type: "initial" | FollowupType;
  /** Earlier e-mails in this thread, chronological — so a followup can avoid repeating a fact/angle already used. */
  previousEmails?: ThreadEmail[];
}): Promise<OutreachEmail> {
  const { lead, segmentName, type } = input;
  const previousEmails = input.previousEmails ?? [];

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

  const facts = `DÁTA O FIRME (použi konkrétne, nevymýšľaj; surové skóre/čísla z analýzy necituj):
Firma: ${lead.companyName}
Segment (odvetvie): ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Konateľ/kontakt: ${lead.ownerName ?? "neznámy"}${lead.ownerPosition ? ` (${lead.ownerPosition})` : ""}
Rok v pätičke webu (copyright): ${lead.copyrightYear ?? "—"}
PageSpeed mobil: ${lead.pageSpeedMobile != null ? `${lead.pageSpeedMobile}/100` : "—"}
Vizuálny dojem (AI): ${lead.aiVisualReason ?? "—"}
Hlavné vizuálne problémy: ${(lead.visualIssues ?? []).slice(0, 4).join("; ") || "—"}
Ďalšie nedostatky webu: ${(lead.websiteIssues ?? []).slice(0, 5).join("; ") || "—"}${briefBlock}
Zhrnutie stavu webu: ${lead.aiSummary ?? "—"}${threadBlock}`;

  const initialSubject = previousEmails[0]?.subject || lead.companyName;
  const instruction =
    type === "initial"
      ? "Napíš PRVÝ (initial) cold email podľa štruktúry a pravidiel."
      : `Napíš ${THREAD_LABEL[type]}. Predmet: "Re: ${initialSubject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}".`;

  // Optional booking link (initial emails only) — appended just before the sign-off.
  const bookingLink = process.env.BOOKING_LINK?.trim();
  const bookingRule =
    type === "initial" && bookingLink
      ? `\n\nBOOKING LINK — na koniec emailu, PRED podpisom ("S pozdravom,"/"S úctou,"), pridaj na samostatný riadok presne:\n"Prípadne si môžete vybrať termín priamo tu: ${bookingLink}"`
      : "";

  const system =
    (type === "initial"
      ? OUTREACH_SYSTEM + (useBrief ? BRIEF_ADDENDUM : "")
      : OUTREACH_SYSTEM + followupAddendum(type)) + bookingRule;

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system,
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
