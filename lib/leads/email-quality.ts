// Deterministická kontrola cold e-mailu PRED uložením. Model občas poruší pravidlá,
// ktoré sú v prompte (vykanie v jednotnom čísle, malé "vás", pomlčky, zakázané
// frázy, vymyslené čísla) — takýto mail sa nesmie dostať k používateľovi ani do
// odoslania. Toto sú tvrdé pravidlá zo špecifikácie mailu; jazykovú korektúru
// (pravopis, štylistika) robí zvlášť AI korektor (ai.ts → proofreadEmail).

export type EmailKind = "initial" | "followup1" | "followup2" | "followup3" | "rozbor";

export interface LintInput {
  kind: EmailKind;
  subject: string;
  paragraphs: string[];
  /** Rok v pätičke webu — povolené číslo v texte. */
  copyrightYear?: number | null;
  /** Ďalšie roky, ktoré sa vyskytujú vo vstupných dátach (napr. "copyright 2015" v nedostatkoch) — tiež povolené. */
  allowedYears?: number[];
  /** Čísla doložené OVERENÝM zistením (napr. "6" z "6 z 9 konkurentov má online rezerváciu") — tiež povolené. */
  allowedNumbers?: string[];
}

export interface LintResult {
  errors: string[];
  warnings: string[];
}

const L = "\\p{L}";
// Slovo ako samostatný token (unicode-aware — \b nezvláda diakritiku na konci).
const word = (alt: string) => new RegExp(`(?<!${L})(?:${alt})(?!${L})`, "u");

// Zámená pri vykaní sa píšu s veľkým V — malé je chyba.
const LOWERCASE_YOU = word("vy|vás|vám|váš|vaša|vaše|vašu|vašej|vašich|vaším|vaši|vašim|vašimi|vami|vašom");
// Tykanie.
const INFORMAL_YOU = new RegExp(
  `(?<!${L})(?:ty|tvoj|tvoja|tvoje|tvoju|tvojho|tvojej|tvojím|tebe|teba|ťa|tvoji)(?!${L})`,
  "iu", // aj "Ty" na začiatku vety
);
// Sloveso v jednotnom čísle pri "ste": "mal by ste", "bol ste", "mohol ste"…
const SINGULAR_WITH_STE = new RegExp(`(?<!${L})${L}+l(?:\\s+by)?\\s+ste(?!${L})`, "iu");
// Pisateľ je MUŽ: "pozrela som", "všimla som".
const FEMALE_WRITER = new RegExp(`(?<!${L})${L}+la\\s+som(?!${L})`, "iu");

const BLOCKLIST: [RegExp, string][] = [
  [/pôsob\p{L}*\s+zastaran/iu, "\"pôsobí zastarano\" (zakázaná fráza)"],
  [/online\s+prítomnos/iu, "\"online prítomnosť\""],
  [/digitáln\p{L}+\s+prezentáci/iu, "\"digitálna prezentácia\""],
  [/moderný\s+web/iu, "\"moderný web\""],
  [/profesionálny\s+web/iu, "\"profesionálny web\""],
  [/solidný\s+záber/iu, "\"solidný záber\""],
  [/slušný\s+základ/iu, "\"slušný základ\""],
  [/pekný\s+koncept/iu, "\"pekný koncept\""],
  [/vyzerá\s+dobre/iu, "\"vyzerá dobre\""],
  [/pôsob\p{L}*\s+príjemne/iu, "\"pôsobí príjemne\""],
  [/komplexn\p{L}+\s+prístup/iu, "\"komplexný prístup\""],
  [/naša\s+spoločnosť/iu, "\"naša spoločnosť\""],
  [/dovoľujeme\s+si/iu, "\"dovoľujeme si Vás osloviť\""],
  [/v\s+dnešnej\s+dobe/iu, "\"v dnešnej dobe\""],
  [/sme\s+tím/iu, "\"sme tím odborníkov\""],
  [/agentúr\p{L}*\s+špecializujúc/iu, "\"agentúra špecializujúca sa\""],
  [/chceli\s+by\s+sme\s+(?:Vám|vám)\s+pomôcť/iu, "\"chceli by sme Vám pomôcť\""],
  [/chýba\s+kontaktný\s+formulár/iu, "\"chýba kontaktný formulár\""],
  [/chýba\s+rezervačný\s+systém/iu, "\"chýba rezervačný systém\""],
  [/(?:pekné|pekná|pekný)\s+(?:fotky|fotka|web)/iu, "pozitívne hodnotenie webu/fotiek"],
  [/všimol\s+som\s+si/iu, "\"všimol som si\" (zakázané otvorenie)"],
  [/pozrel\s+som\s+sa\s+na\s+(?:v[aá]š|vaše|Váš|Vaše)/u, "\"pozrel som sa na Váš web\" (zakázané otvorenie)"],
];

// Generické záverečné otázky a stopové klišé — znejú ako hromadný e-mail (používateľ:
// "úplne AI, nič hodnotné"). Zakázané v každom maile.
const GENERIC_PHRASES: [RegExp, string][] = [
  [/dáva\s+(?:Vám\s+)?(?:to|tento\s+pohľad|tento\s+názor|toto)\s+zmysel/iu, "generická otázka \"Dáva Vám to zmysel?\""],
  [/sedí\s+Vám\s+(?:to|tento|takýto)/iu, "generická otázka \"Sedí Vám tento pohľad?\""],
  [/čo\s+na\s+to\s+hovoríte/iu, "generická otázka \"Čo na to hovoríte?\""],
  [/presne\s+ten\s+druh/iu, "poučka \"to je presne ten druh…\" (po fakte hneď konkrétny dôsledok pre NICH)"],
  [/nejde\s+o\s+[^.]{0,60},\s*(?:ale|než)\s+o\b|nielen\s+[^.]{0,60},\s*ale\s+(?:aj|i)\b/iu, "vzor \"nejde o X, ale o Y\" / \"nielen X, ale aj Y\" (strojový tón)"],
  [/(?<!\p{L})(?:štátis\p{L}*|státis\p{L}*|desiatk\p{L}*\s+tisíc\p{L}*)/iu, "odhad sumy (státisíce, desiatky tisíc…) nie je odvoditeľný z dát"],
  [/(?:dôvera|povesť|meno)\s+(?:sa\s+)?buduje\s+roky|buduje\s+roky/iu, "všeobecná múdrosť \"dôvera sa buduje roky\""],
  [/(?:alebo\s+)?(?:to\s+)?vidíte\s+to\s+(?:inak|podobne)|vnímate\s+to\s+inak|máte\s+na\s+to\s+iný\s+názor/iu, "generická otázka \"…alebo to vidíte inak?\""],
  [/časť\s+(?:z\s+)?(?:tých|týchto|takýchto|nich|záujemcov|klientov|pacientov|ľudí|hostí|zákazníkov|návštevníkov)/iu, "klišé \"časť záujemcov odíde\""],
  [/(?:ku|k|u)\s+konkurenci\p{L}*|odíd\p{L}*\s+(?:inam|inde)|skús\p{L}*\s+to\s+inde|(?:to\s+)?vzd(?:á|ajú|ať)(?:\s+to)?(?![\p{L}])|ľudia\s+odchádzajú|odchádzaj\p{L}*\s+(?:bez|inam|inde)/iu, "klišé \"odíde ku konkurencii / skúsi to inde\""],
];

// Oslovenie a podpis pridáva kód — v odsekoch nemajú čo robiť.
const FORBIDDEN_IN_BODY: [RegExp, string][] = [
  [/dobrý\s+deň/iu, "oslovenie \"Dobrý deň\" (pridáva sa automaticky)"],
  [/vážen[ýá]/iu, "oslovenie \"Vážený/Vážená\" (pridáva sa automaticky)"],
  [/s\s+pozdravom|s\s+úctou/iu, "podpis \"S pozdravom/S úctou\" (pridáva sa automaticky)"],
  [/samuel\s+bibeň/iu, "podpis \"Samuel Bibeň\" (pridáva sa automaticky)"],
  [/^\s*predmet\s*:/imu, "riadok \"Predmet:\" v tele"],
  [/\{\{|\}\}|\[[^\]]*\]|\*\*/u, "zvyšok značky/markdownu"],
  [/konate[ľl]/iu, "označenie príjemcu za konateľa"],
];

const wordCount = (s: string) =>
  s.split(/\s+/).filter((t) => t && !/^[-–—]+$/.test(t)).length;

export function lintEmail(input: LintInput): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { kind, subject, paragraphs } = input;
  const body = paragraphs.join("\n\n");

  // ── Predmet ────────────────────────────────────────────────────────────────
  const subj = subject.trim();
  if (!subj) errors.push("prázdny predmet");
  if (kind === "initial") {
    if (subj !== subj.toLowerCase())
      errors.push("predmet musí byť celý malými písmenami");
    const n = wordCount(subj);
    if (n < 2 || n > 5) errors.push(`predmet má ${n} slov (má mať 2-4)`);
    if (/ponuk|spolupr|rieš/iu.test(subj))
      errors.push("predmet obsahuje zakázané slovo (ponuka/spolupráca/riešenie)");
  }
  if (/[—–]/u.test(subj)) errors.push("predmet obsahuje pomlčku (—/–)");

  // ── Štruktúra a dĺžka ─────────────────────────────────────────────────────
  const count = paragraphs.length;
  if (kind === "initial" && (count < 2 || count > 5))
    errors.push(`počet odsekov je ${count}, má byť 2-5 (vrátane P. S.)`);
  if ((kind === "followup1" || kind === "followup2") && (count < 2 || count > 3))
    errors.push(`follow-up má ${count} odsekov (má mať 2-3)`);
  if (kind === "followup3" && (count < 1 || count > 3))
    errors.push(`záverečný follow-up má ${count} odsekov (má mať 1-3)`);
  // Rozbor = úvod + 3 body + záver (číslovanie dopĺňa kód).
  if (kind === "rozbor" && count !== 5)
    errors.push(`rozbor má ${count} odsekov, má mať 5 (úvod, 3 body, záver)`);
  if (paragraphs.some((p) => !p.trim())) errors.push("prázdny odsek");

  const words = wordCount(body);
  const range: Record<EmailKind, [number, number]> = {
    initial: [60, 175],
    followup1: [28, 85],
    followup2: [28, 85],
    followup3: [20, 60],
    rozbor: [80, 300],
  };
  const [min, max] = range[kind];
  if (words < min || words > max)
    errors.push(`dĺžka ${words} slov je mimo rozsahu ${min}-${max}`);
  if (kind === "initial") {
    if (paragraphs.some((p) => (p.match(/[.!?]+(?:\s|$)/g)?.length ?? 0) > 3))
      warnings.push("odsek má viac než 3 vety");
    // Posledný odsek = mäkké CTA, zvyčajne otázka.
    if (!/\?/.test(paragraphs[count - 1] ?? ""))
      warnings.push("posledný odsek nie je otázka (mäkké CTA)");
  }

  // ── Jazyk: vykanie, rod pisateľa ─────────────────────────────────────────
  if (LOWERCASE_YOU.test(body))
    errors.push("zámeno Vy/Vás/Vám/Váš musí byť pri vykaní s veľkým začiatočným písmenom");
  if (INFORMAL_YOU.test(body)) errors.push("tykanie (musí byť vykanie)");
  const singular = body.match(SINGULAR_WITH_STE)?.[0];
  if (singular)
    errors.push(`sloveso v jednotnom čísle pri vykaní: "${singular}" (má byť "mali by ste")`);
  if (FEMALE_WRITER.test(body))
    errors.push("pisateľ je muž — nepoužívaj ženské tvary (pozrela som)");

  // ── Znaky: len latinka (model občas vsunie cyriliku: "часť" namiesto "časť") ──
  const foreign = `${subj}\n${body}`.match(/[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\n]/u)?.[0];
  if (foreign) errors.push(`text obsahuje cudzí znak "${foreign}" (nie latinka)`);
  if (/[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF]/u.test(`${subj}${body}`))
    errors.push("text obsahuje cyriliku/gréčtinu/čínske znaky");

  // ── Typografia ────────────────────────────────────────────────────────────
  if (/[—–]/u.test(body)) errors.push("telo obsahuje pomlčku — alebo – (povolená len obyčajná -)");
  if (/ {2,}/.test(body)) warnings.push("dvojitá medzera");
  if (/(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu.test(body)) warnings.push("opakované slovo za sebou");
  // Prvý odsek nadväzuje na oslovenie s čiarkou, preto sa môže začínať malým písmenom.
  if (paragraphs.slice(1).some((p) => /^\p{Ll}/u.test(p.trim()) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(p.trim())))
    warnings.push("odsek začína malým písmenom");

  // ── Obsah ─────────────────────────────────────────────────────────────────
  for (const [re, label] of BLOCKLIST)
    if (re.test(body) || re.test(subj)) errors.push(`zakázaná fráza: ${label}`);
  for (const [re, label] of GENERIC_PHRASES)
    if (re.test(body)) errors.push(`zakázané: ${label}`);
  for (const [re, label] of FORBIDDEN_IN_BODY)
    if (re.test(body)) errors.push(`v tele sa nesmie objaviť ${label}`);

  // Čísla: iba rok z pätičky webu (domény s číslicami sa nepočítajú).
  const noDomains = `${body}\n${subj}`.replace(
    /[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.(?:sk|cz|com|eu|org|net|info|biz)\b/giu,
    " ",
  );
  const numbers = noDomains.match(/\d[\d\s.,]*/g) ?? [];
  for (const n of numbers) {
    const clean = n.replace(/[\s.,]+$/g, "").trim();
    if (!clean) continue;
    if (input.copyrightYear && clean === String(input.copyrightYear)) continue;
    if (input.allowedYears?.some((y) => clean === String(y))) continue;
    // 4,8 ≡ 4.8 a "6 624" ≡ "6624"
    const canon = (x: string) => x.replace(/\s+/g, "").replace(/,/g, ".");
    if (input.allowedNumbers?.some((a) => canon(a) === canon(clean))) continue;
    errors.push(`číslo "${clean}" nie je odvoditeľné zo vstupných dát (povolený je len rok, ktorý je vo vstupných dátach)`);
  }
  // Milióny/miliardy len s číslom doloženým vo vstupných dátach ("poistenie 5 miliónov Kč" z webu); holé "milióny" je odhad.
  const canonNum = (x: string) => x.replace(/\s+/g, "").replace(/,/g, ".").replace(/[.]+$/, "");
  for (const m of noDomains.matchAll(/(?<!\p{L})(?:(\d[\d\s.,]*?)\s*)?(?:mil\.|milión\p{L}*|miliard\p{L}*)/giu)) {
    const n = m[1] ? canonNum(m[1]) : "";
    if (!n || !input.allowedNumbers?.some((a) => canonNum(a) === n))
      errors.push("odhad sumy (milióny, miliardy…) nie je odvoditeľný z dát (povolené len s číslom z overeného zistenia)");
  }
  // Počty slovom ("sedem rokov", "dvadsať klientov", "polovica", "desaťročie") — model ich
  // vie zle vypočítať (2026 - 2018 nie je 7) a sú to čísla, ktoré dáta nepodporujú.
  const wordNumber = noDomains.match(
    /(?<!\p{L})(?:dva|dve|tri|štyri|päť|šesť|sedem|osem|deväť|desať|\p{L}*násť|dvadsať|tridsať|štyridsať|päťdesiat|sto|tisíc)\s+(?:rok|rokov|roky|rokmi|mesiac|mesiacov|mesiace|klient|pacient|zákazník|návštev|objednáv|dopyt|percent)\p{L}*/iu,
  )?.[0];
  if (wordNumber) errors.push(`počet slovom "${wordNumber}" nie je odvoditeľný z dát`);
  if (/(?<!\p{L})(?:polovic|tretin|štvrtin|dvojnásob|trojnásob|desaťroč|storoč)\p{L}*/iu.test(noDomains))
    errors.push("odhad miery/počtu slovom (polovica, dvojnásobne, desaťročie…) nie je odvoditeľný z dát");
  // Časový odhad dopadu ("ročne ukrátiť o pár klientov", "stačí stratiť jediného klienta mesačne")
  // — miera dopadu, ktorú dáta nepodporujú.
  if (/(?<!\p{L})(?:mesačne|ročne|týždenne|denne|ročných|mesačných|ročnej|mesačnej|ročnom|mesačnom)(?!\p{L})/iu.test(noDomains))
    errors.push("časový odhad dopadu (mesačne/ročne/denne…) nie je odvoditeľný z dát");
  if (/(?<!\p{L})(?:každý|každé|každú|každom)\s+(?:mesiac|týždeň|rok|deň)|(?<!\p{L})za\s+(?:mesiac|rok|týždeň)(?!\p{L})/iu.test(noDomains))
    errors.push("časový odhad dopadu (každý mesiac / za rok…) nie je odvoditeľný z dát");
  if (/(?<!\p{L})(?:jedin\p{L}+|jedn\p{L}+|pár|niekoľk\p{L}+)\s+(?:klient|pacient|zákazník|dopyt|objednáv|hosť|host)\p{L}*/iu.test(noDomains))
    errors.push("odhad počtu klientov (jediný/pár/niekoľko…) nie je odvoditeľný z dát");
  // Zovšeobecnenia, ktoré dáta nepodporujú ("väčšina záujemcov", "prevažne z mobilu").
  const overgen = noDomains.match(
    /(?<!\p{L})(?:väčšin\p{L}*|drvivá\p{L}*|prevažn\p{L}*|spravidla|väčšinou|zvyčajne|obvykle|takmer\s+všetci|všetci\s+(?:klienti|záujemci|pacienti|zákazníci|hostia)|každý\s+(?:záujemca|klient|pacient|zákazník|návštevník|hosť))(?!\p{L})/iu,
  )?.[0];
  if (overgen) errors.push(`zovšeobecnenie "${overgen}" nie je odvoditeľné z dát (vypusti ho, nenahrádzaj ho "časť z nich")`);
  if (/%|percent|\beur\b|€/iu.test(noDomains))
    errors.push("v texte sa nesmú objaviť percentá/sumy");

  return { errors, warnings };
}
