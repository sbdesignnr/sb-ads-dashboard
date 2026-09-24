// Deterministická kontrola cold e-mailu PRED uložením. Model občas poruší pravidlá,
// ktoré sú v prompte (vykanie v jednotnom čísle, malé "vás", pomlčky, zakázané
// frázy, vymyslené čísla) — takýto mail sa nesmie dostať k používateľovi ani do
// odoslania. Toto sú tvrdé pravidlá zo špecifikácie mailu; jazykovú korektúru
// (pravopis, štylistika) robí zvlášť AI korektor (ai.ts → proofreadEmail).

export type EmailKind = "initial" | "followup1" | "followup2" | "followup3";

export interface LintInput {
  kind: EmailKind;
  subject: string;
  paragraphs: string[];
  /** Rok v pätičke webu — jediné číslo, ktoré sa smie v texte objaviť. */
  copyrightYear?: number | null;
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
  if (kind === "initial" && count !== 3)
    errors.push(`počet odsekov je ${count}, má byť presne 3`);
  if ((kind === "followup1" || kind === "followup2") && (count < 2 || count > 3))
    errors.push(`follow-up má ${count} odsekov (má mať 2-3)`);
  if (kind === "followup3" && (count < 1 || count > 3))
    errors.push(`záverečný follow-up má ${count} odsekov (má mať 1-3)`);
  if (paragraphs.some((p) => !p.trim())) errors.push("prázdny odsek");

  const words = wordCount(body);
  const range: Record<EmailKind, [number, number]> = {
    initial: [45, 110],
    followup1: [28, 85],
    followup2: [28, 85],
    followup3: [20, 60],
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

  // ── Typografia ────────────────────────────────────────────────────────────
  if (/[—–]/u.test(body)) errors.push("telo obsahuje pomlčku — alebo – (povolená len obyčajná -)");
  if (/ {2,}/.test(body)) warnings.push("dvojitá medzera");
  if (/(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu.test(body)) warnings.push("opakované slovo za sebou");
  if (paragraphs.some((p) => /^\p{Ll}/u.test(p.trim()) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(p.trim())))
    warnings.push("odsek začína malým písmenom");

  // ── Obsah ─────────────────────────────────────────────────────────────────
  for (const [re, label] of BLOCKLIST)
    if (re.test(body) || re.test(subj)) errors.push(`zakázaná fráza: ${label}`);
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
    errors.push(`číslo "${clean}" nie je odvoditeľné zo vstupných dát (povolený je len rok z pätičky)`);
  }
  if (/%|percent|\beur\b|€/iu.test(noDomains))
    errors.push("v texte sa nesmú objaviť percentá/sumy");

  return { errors, warnings };
}
