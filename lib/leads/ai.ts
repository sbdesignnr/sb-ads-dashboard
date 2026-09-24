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
// Korektúru robí ten istý model ako písanie. Opus 5.5 bol na jeden mail asi 5x drahší
// a jazykové chyby (cyrilika, počty slovom, klišé) zachytáva deterministická kontrola
// v email-quality.ts; korektor dopĺňa pravopis a pravdivosť.
const PROOF_MODEL = process.env.LEADS_PROOFREAD_MODEL?.trim() || WRITER_MODEL;

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

// Krátky, STATICKÝ prompt (~750 tokenov, predtým ~4 200) — posiela sa pri každom maili,
// preto je jeho veľkosť priamo cena; a keďže je pri všetkých mailoch rovnaký, dá sa
// cachovať (cache_control v createMessage). Premenlivé veci (uhol, záver, dáta firmy)
// idú do správy, nie sem.
const OUTREACH_SYSTEM = `Si Samuel Bibeň, web developer z Nitry. Píšeš krátky osobný e-mail vedeniu firmy, ktorej web si si naozaj pozrel. Meno adresáta nepoznáš: oslovenie a podpis pridá systém, ty píšeš IBA odseky tela (bez "Dobrý deň", bez podpisu, bez mena, bez slov "pán/pani/konateľ"). Vždy po slovensky.

CIEĽ
Adresát má pocítiť, že mu píše človek, ktorý sa pozrel práve na JEHO web a vie mu s niečím konkrétnym pomôcť - nie hromadná správa. Odpovie len na to, čo je konkrétne, týka sa jeho podnikania a dá sa jednoducho odpovedať.

ŠTÝL
- Píš ako človek človeku: krátke konkrétne vety, žiadne marketingové frázy, žiadny "AI" tón.
- 2-3 krátke odseky, spolu 35-80 slov.
- Každý e-mail musí znieť INAK (iné otvorenie, iná stavba viet). Ukážky nižšie sú len tón - nikdy ich nekopíruj.
- IBA prvý odsek začni malým písmenom (nadväzuje na oslovenie s čiarkou), okrem vlastného mena, značky alebo domény. Ďalšie odseky začni normálne veľkým písmenom.
- "Uhol otvorenia" a "Záver" ti určujú dáta - drž sa ich.
- NIKDY nekonči otázkou typu "Dáva Vám to zmysel?", "Sedí Vám tento pohľad?", "Čo na to hovoríte?", "Vidíte to inak?" - znejú ako hromadný e-mail. Nepíš ani "časť záujemcov odíde ku konkurencii" - to je klišé.

PRAVDIVOSŤ (najdôležitejšie)
- Používaj IBA fakty z dát. Nič nevymýšľaj ani nedomýšľaj o firme, jej klientoch alebo dopade.
- Žiadne čísla, percentá, sumy, počty klientov ani počty rokov (ani slovom), žiadne odhady dopadu ("mesačne", "za rok", "väčšina", "pár klientov"). Rok z pätičky uveď len ak je v dátach.
- Najsilnejší je konkrétny detail z "Hlavné vizuálne problémy" alebo "Ďalšie nedostatky": opíš ho tak, ako ho vidí návštevník ich webu, bez hodnotenia (nepíš "škaredý", "zlý", "zastaraný").
- Nikdy pozitívne hodnotenie webu, fotiek ani firmy (žiadne komplimenty).
- Surové skóre a čísla z analýzy necituj; opíš dôsledok slovami.

JAZYK
- Vykanie: Vy, Vás, Vám, Váš, Vaše, Vašu, Vašej… VŽDY s veľkým V; slovesá v množnom čísle ("mali by ste", "boli ste", NIE "mal by ste"). Si MUŽ: "pozrel som", "všimol som si".
- Iba obyčajná pomlčka "-", nikdy — ani –. Úvodzovky slovenské „takto“.
- Zakázané: "zastaraný web", "moderný web", "profesionálny web", "online prítomnosť", "digitálna prezentácia", "komplexný", "riešenie", "ponuka", "spolupráca", "naša spoločnosť", "dovoľujeme si", "v dnešnej dobe", "sme tím".
- Predmet: 2-4 slová malými písmenami, obsahuje doménu alebo konkrétny nález (napr. "fyziocare.sk - mobil"). Nikdy "ponuka", "spolupráca", "riešenie".

NEOSLOVUJ (vráť prázdny predmet, žiadne odseky a skipReason): záchranné služby, štátne inštitúcie/obce/školy, verejné nemocnice, veľké korporácie a pobočky nadnárodných koncernov, banky a poisťovne, čisté B2B firmy bez verejného webu. Ak firma nemá web, postav e-mail na tom, že vlastnú stránku nemá.

UKÁŽKY (len tón a dĺžka - vety a formulácie vždy vymysli NOVÉ podľa dát, NIKDY nekopíruj slová ani vety z ukážok; ani "zaujíma ma, ako sa k Vám dnes dostávajú noví klienti", ani "Pýtam sa preto"):
[detail → ponuka rozboru]
Predmet: fyziocare.sk - mobil
otvoril som si fyziocare.sk na mobile a hneď na úvode ma zastavil obrázok, ktorý sa sám prepína - kým som sa rozhliadol, bol preč.
Ak chcete, pripravím Vám krátky rozbor: tri konkrétne veci, ktoré by som na tej stránke zmenil. Poslať Vám ho?

[zákazník → otázka o ich podnikaní]
Predmet: restauraciaroza.sk - rezervácie
kto si Vašu reštauráciu hľadá na mobile, na restauraciaroza.sk nájde jedinú cestu k stolu - zavolať. V pätičke je navyše rok 2017.
Rezervácie Vám dnes chodia radšej telefonicky, alebo už aj z webu?

[otázka na začiatku → dôvod] (bez ďalšej otázky a bez ponuky)
Predmet: kancelaria-novak.sk - dopyty
(1 otázka o tom, odkiaľ im dnes chodia noví klienti - formulovaná po svojom pre ich odvetvie)
(1-2 vety: konkrétne zistenie z ich webu, ktoré je dôvodom otázky)

DÔSLEDOK opíš konkrétne z pohľadu JEDNÉHO človeka a jednej situácie (napr. "kto hľadá termín večer, nemá ako sa objednať"), nikdy zovšeobecnením o skupine ("časť záujemcov", "ľudia odchádzajú").

Výsledok vlož VÝHRADNE cez nástroj "uloz_email".`;

// Uhol otvorenia + typ záveru sa určujú v KÓDE podľa leadu (nie na uvážení modelu),
// inak model zbieha k jednej šablóne a všetky maily znejú rovnako.
const OPENING_ANGLES = {
  detail:
    "Otvor JEDNÝM konkrétnym detailom, ktorý je vidieť len na ich webe (z \"Hlavné vizuálne problémy\" alebo \"Ďalšie nedostatky\"), opísaným tak, ako ho vidí návštevník. Prvá veta = ten detail.",
  zakaznik:
    "Otvor pohľadom ich zákazníka: čo zažije človek, ktorý si web otvorí z mobilu a chce sa objednať alebo ozvať (použi konkrétny nedostatok z dát).",
  otazka:
    "Otvor úprimnou krátkou otázkou o tom, ako sa k nim dnes dostávajú noví klienti, a hneď ju spoj s JEDNÝM konkrétnym zistením z ich webu.",
} as const;

const ENDINGS = {
  none:
    "Záver: bez ďalšej otázky a bez ponuky - otázka na začiatku je jediné, o čo žiadaš. Zakonči vetou, ktorá vysvetľuje, prečo sa pýtaš (konkrétne zistenie z ich webu).",
  rozbor:
    "Záver: ponúkni konkrétny bezplatný rozbor, napr. že pripravíš krátky rozbor s tromi konkrétnymi vecami, ktoré by si na webe zmenil, a opýtaš sa, či im ho poslať (formuluj VLASTNÝMI slovami, bez tlaku).",
  otazka:
    "Záver: jedna konkrétna, ľahko zodpovedateľná otázka o ich podnikaní (kde im dnes vznikajú objednávky/klienti - telefón, odporúčania, web) podľa toho, čo firma SKUTOČNE robí (Kontext o firme), nie podľa názvu odvetvia. NIE otázka, či súhlasia s tvojím názorom.",
} as const;

// 6 kombinácií: 2x ponuka rozboru, 2x otázka na záver, 2x jediná otázka na začiatku.
const STYLE_COMBOS: [keyof typeof OPENING_ANGLES, keyof typeof ENDINGS][] = [
  ["detail", "rozbor"],
  ["zakaznik", "otazka"],
  ["otazka", "none"],
  ["detail", "otazka"],
  ["zakaznik", "rozbor"],
  ["otazka", "none"],
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Nápoveda pre záverečnú otázku podľa odvetvia (aby bola o ich reálnom podnikaní). */
function questionHint(segmentName: string): string {
  const n = segmentName.toLowerCase();
  if (/fyzio|lekár|ordinác|zubn|doktor|klinik/.test(n)) return "noví pacienti (odporúčania, telefón, web)";
  if (/reštaur|kaviar|hotel|ubytov|penzión/.test(n)) return "rezervácie stolov/izieb (telefón vs. web)";
  if (/advok|notár|právn|účtovn|daň/.test(n)) return "noví klienti (odporúčania vs. Google/web)";
  if (/architekt|dizajn/.test(n)) return "noví klienti a zákazky (odporúčania vs. web)";
  if (/stavb|remesl|rekonštr|inštal/.test(n)) return "dopyty na zákazky (telefón vs. formulár)";
  if (/realit/.test(n)) return "dopyty od záujemcov o nehnuteľnosti";
  if (/fitness|kozmet|wellness|joga|masáž/.test(n)) return "noví klienti a rezervácie termínov";
  return "noví klienti alebo objednávky";
}

// FOLLOW-UPY: krátke, každý s iným uhlom; predošlé maily sú v dátach (nesmie sa opakovať).
const FOLLOWUP_TYPES = ["followup1", "followup2", "followup3"] as const;
type FollowupType = (typeof FOLLOWUP_TYPES)[number];

function followupAddendum(type: FollowupType): string {
  const common = `

--- REŽIM FOLLOWUP ---
Toto je pokračovanie e-mailu, na ktorý adresát neodpovedal. Oslovenie a podpis pridá systém - nepíš ich. Predmet: "Re: " + pôvodný predmet. Nesmieš zopakovať fakt ani uhol z predošlých e-mailov (sú v dátach). Nepíš "pripomínam sa" ani "len som sa chcel opýtať, či ste videli môj e-mail".`;
  if (type === "followup1")
    return `${common}
FOLLOWUP 1 (30-60 slov, 2 krátke odseky): jeden INÝ konkrétny nález z dát. Ak predošlý e-mail ponúkal rozbor, pripomeň ho jednou vetou. Zakonči konkrétne, nie generickou otázkou.`;
  if (type === "followup2")
    return `${common}
FOLLOWUP 2 (30-60 slov, 2 krátke odseky): iný uhol - pohľad ich zákazníka na web (bez čísel a klišé). Zakonči konkrétne, nie generickou otázkou.`;
  return `${common}
FOLLOWUP 3 (20-45 slov): zdvorilé zatvorenie BEZ otázky - toto je posledná správa, dvere ostávajú otvorené. Neopakuj fakty z predošlých e-mailov.`;
}

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
        description: "Odseky tela v poradí. Initial email: 2-3 krátke odseky, spolu 35-80 slov (otvorenie podľa zadania, záver podľa zadania). Followup: pozri REŽIM FOLLOWUP. BEZ oslovenia ('Dobrý deň'), BEZ podpisu, BEZ mena adresáta. Prázdne pole, ak segment preskakuješ.",
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

Ponuka bezplatného rozboru a záverečná otázka na ich podnikanie sú ZÁMERNÉ prvky e-mailu - nie sú to vymyslené tvrdenia.

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
    max_tokens: 800,
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

// ── Spotreba tokenov (pre odhad nákladov v UI) ──────────────────────────────────
export interface AiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: number;
}
const usageTotals: AiUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };

function trackUsage(u: Anthropic.Usage | undefined) {
  if (!u) return;
  usageTotals.input += u.input_tokens ?? 0;
  usageTotals.output += u.output_tokens ?? 0;
  usageTotals.cacheRead += u.cache_read_input_tokens ?? 0;
  usageTotals.cacheWrite += u.cache_creation_input_tokens ?? 0;
  usageTotals.calls++;
}

/** Vynuluje počítadlo (na začiatku dávky). */
export function resetAiUsage(): void {
  Object.assign(usageTotals, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 });
}

/** Spotreba od posledného resetu + hrubý odhad ceny v EUR (cenník triedy Sonnet: $3/$15 za 1M tokenov). */
export function getAiUsage(): AiUsage & { estimatedEur: number } {
  const usd =
    (usageTotals.input * 3 + usageTotals.output * 15 + usageTotals.cacheRead * 0.3 + usageTotals.cacheWrite * 3.75) /
    1_000_000;
  return { ...usageTotals, estimatedEur: Math.round(usd * 0.92 * 1000) / 1000 };
}

// Novšie modely majú iné obmedzenia API (napr. Sonnet 5 odmieta `temperature`, Opus 5.5
// odmieta vynútený `tool_choice`). Volanie sa pri takejto chybe raz upraví a model
// sa zapamätá — zmena modelu cez env premennú tak nezastaví generovanie mailov.
const modelQuirks = new Map<string, { noTemperature?: boolean; autoToolChoice?: boolean; noThinkingParam?: boolean }>();

async function createMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const quirks = modelQuirks.get(params.model) ?? {};
  for (let i = 0; i < 3; i++) {
    const p = { ...params };
    // Dlhý statický system prompt sa cachuje (opakované volania platia ~10 % vstupu).
    if (typeof p.system === "string" && p.system.length > 1500)
      p.system = [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }];
    // Sonnet 5 a novšie majú PREDVOLENE zapnuté "premýšľanie": skryté úvahy sa platia ako
    // výstup (890 z 1 139 tokenov na jednu korektúru) a pri nízkom max_tokens zrežú
    // odpoveď. Na písanie/korektúru krátkeho mailu ich nepotrebujeme → vypnúť.
    if (!quirks.noThinkingParam) (p as { thinking?: unknown }).thinking = { type: "disabled" };
    if (quirks.noTemperature) delete p.temperature;
    if (quirks.autoToolChoice && p.tool_choice?.type === "tool") p.tool_choice = { type: "auto" };
    try {
      const res = await client.messages.create(p);
      trackUsage(res.usage);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!quirks.noTemperature && /temperature/i.test(msg) && /deprecated|not supported|unsupported/i.test(msg)) {
        quirks.noTemperature = true;
      } else if (!quirks.autoToolChoice && /tool_choice/i.test(msg)) {
        quirks.autoToolChoice = true;
      } else if (!quirks.noThinkingParam && /thinking/i.test(msg)) {
        quirks.noThinkingParam = true;
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

  // Rýchlosť len slovom — surové číslo sa v maile nesmie objaviť.
  const speed =
    lead.pageSpeedMobile == null
      ? "—"
      : lead.pageSpeedMobile < 50
        ? "pomalá"
        : lead.pageSpeedMobile < 70
          ? "podpriemerná"
          : "—";

  // Uhol otvorenia a typ záveru určuje kód podľa leadu (variabilita medzi mailmi).
  const [angleKey, endingKey] = STYLE_COMBOS[hashString(lead.id ?? lead.companyName) % STYLE_COMBOS.length];
  const styleBlock =
    type === "initial"
      ? `\n\nZADANIE\nUhol otvorenia: ${OPENING_ANGLES[angleKey]}\n${ENDINGS[endingKey]}\nNápoveda k otázke (odvetvie): ${questionHint(segmentName)}`
      : "";

  // Meno adresáta MODEL NEDOSTÁVA (oslovenie robí kód) — nemá ako ho použiť zle.
  const clip = (t: string | null | undefined, n: number) => (t ?? "").trim().slice(0, n) || "—";
  const facts = `FIRMA
Názov: ${lead.companyName}
Odvetvie: ${segmentName}
Web: ${lead.websiteUrl ?? "—"}
Mesto: ${lead.companyCity ?? "—"}
Tón: ${formal ? "formálny, uctivý" : "bežný, vecný, priateľský (stále vykanie)"}

ČO SOM NA WEBE ZISTIL (jediný zdroj faktov)
Hlavné vizuálne problémy: ${(lead.visualIssues ?? []).slice(0, 4).join("; ") || "—"}
Ďalšie nedostatky: ${(lead.websiteIssues ?? []).slice(0, 5).join("; ") || "—"}
Rok v pätičke: ${staleYear ?? "—"}
Rýchlosť načítania na mobile: ${speed}
Celkový vizuálny dojem: ${clip(lead.aiVisualReason, 220)}
Kontext o firme (len pomôcka, nekopíruj vety ani klišé): ${clip(lead.aiSummary, 320)}${threadBlock}${styleBlock}`;

  // Roky, ktoré sa smú v maile objaviť, lebo sú v dátach (napr. "copyright 2015").
  const allowedYears = [...facts.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map((m) => Number(m[0]));

  const initialSubject = previousEmails[0]?.subject || lead.companyName;
  const instruction =
    type === "initial"
      ? "Napíš e-mail podľa pravidiel a zadania. Nepíš oslovenie ani podpis."
      : `Napíš ${THREAD_LABEL[type]} (len odseky, bez oslovenia a podpisu). Predmet: "Re: ${initialSubject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}".`;

  // Optional booking link (initial emails only) — appended by code before the sign-off.
  const bookingLink = process.env.BOOKING_LINK?.trim();
  const bookingLine =
    type === "initial" && bookingLink
      ? `Prípadne si môžete vybrať termín priamo tu: ${bookingLink}`
      : undefined;

  const system =
    type === "initial" ? OUTREACH_SYSTEM : OUTREACH_SYSTEM + followupAddendum(type);

  const client = new Anthropic();
  // 2 pokusy: každý opakovaný pokus je ďalšie plateným volaním; prísnejší prompt a pevný uhol
  // by mali stačiť na prvý.
  const MAX_ATTEMPTS = 2;
  let feedback: string[] = [];
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const retryNote = feedback.length
      ? `\n\nPREDCHÁDZAJÚCI POKUS BOL ZAMIETNUTÝ z týchto dôvodov - oprav ich a dodrž VŠETKY pravidlá:\n${feedback.map((f) => `- ${f}`).join("\n")}`
      : "";

    // 1) písanie
    const msg = await createMessage(client, {
      model: WRITER_MODEL,
      max_tokens: 600,
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
        paragraphs: [
          lowerOpener(paragraphs[0], lead.companyName),
          // Ďalšie odseky vždy s veľkým písmenom (model niekedy pokračuje malým).
          ...paragraphs.slice(1).map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
        ],
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
