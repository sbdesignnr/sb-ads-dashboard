// Čisté pomocné funkcie pre osobné mená (SK/CZ): tituly, priezvisko, rod,
// zhoda dvoch zápisov tej istej osoby a oslovenie do e-mailu. Bez závislostí —
// používa ich overovanie konateľa aj generovanie mailov, takže musia byť
// deterministické a otestované (žiadne "hádanie" cez AI pri mene osoby).

const TITLES_BEFORE = new Set(
  [
    "ing", "mgr", "judr", "phdr", "mudr", "mddr", "mvdr", "rndr", "paeddr",
    "pharmdr", "thdr", "thlic", "bc", "bca", "mga", "dr", "prof", "doc",
    "akad", "arch", "art", "ing.arch", "mba", "icdr", "phmr", "doc.",
  ].map((t) => t.replace(/\.$/, "")),
);

const TITLES_AFTER = new Set(
  [
    "phd", "csc", "drsc", "mba", "mph", "artd", "msc", "dis", "llm", "ll.m",
    "ph.d", "mha", "faan", "febu", "dbam", "msc.", "ing", "mgr", "mgra",
    "ml", "st", "jr", "sr", // mladší / starší
  ].map((t) => t.replace(/\.$/, "")),
);

/** Malé písmená bez diakritiky, bez interpunkcie — na porovnávanie. */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isTitleToken = (tok: string, set: Set<string>): boolean =>
  set.has(foldName(tok).replace(/\s/g, ""));

const NAME_PARTICLES = new Set(["van", "von", "de", "di", "da", "del", "der", "den", "la", "le", "el", "al", "ben", "bin"]);

const isAllCaps = (t: string) => t.length > 1 && t === t.toUpperCase() && t !== t.toLowerCase();

/** "LUZUM" / "luzum" → "Luzum"; "NOVÁK-HORVÁTH" → "Novák-Horváth"; častice ("van") ostanú malé. */
function properCase(token: string): string {
  if (NAME_PARTICLES.has(token.toLowerCase()) && token === token.toLowerCase()) return token;
  if (token !== token.toUpperCase() && token !== token.toLowerCase()) return token; // zmiešané ("McDonald") nechaj
  return token
    .toLowerCase()
    .replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export interface ParsedName {
  titlesBefore: string[];
  given: string[];
  surname: string;
  titlesAfter: string[];
  /** Meno bez titulov: "Matúš Pisár". */
  plain: string;
}

/** Rozdelí "Ing. arch. Eva Croitoru Králová, ArtD." na tituly, krstné meno a priezvisko. */
export function parseName(full: string): ParsedName | null {
  const tokens = full
    .replace(/\s+/g, " ")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const before: string[] = [];
  let i = 0;
  while (i < tokens.length - 1 && isTitleToken(tokens[i], TITLES_BEFORE)) {
    before.push(tokens[i]);
    i++;
  }
  const after: string[] = [];
  let end = tokens.length;
  while (end - 1 > i && isTitleToken(tokens[end - 1], TITLES_AFTER)) {
    after.unshift(tokens[end - 1]);
    end--;
  }
  const names = tokens.slice(i, end);
  if (names.length < 2) return null;
  // České poradie "NOVÁK Jan" (priezvisko veľkými, krstné normálne) → prehoď.
  const surnameFirst =
    isAllCaps(names[0]) && !isAllCaps(names[names.length - 1]);
  const given = (surnameFirst ? names.slice(1) : names.slice(0, -1)).map(properCase);
  const surname = properCase(surnameFirst ? names[0] : names[names.length - 1]);
  return {
    titlesBefore: before,
    given,
    surname,
    titlesAfter: after,
    plain: [...given, surname].join(" "),
  };
}

/**
 * Sú to dva zápisy tej istej osoby? Priezvisko musí sedieť (bez diakritiky) a
 * krstné meno jedného sa musí nachádzať medzi krstnými menami druhého. Tým sa
 * "Alain Michel" (odrezané) NEBERIE za "Alain Michel Müller" a "Peter Novák" za
 * "Ján Novák".
 */
export function samePerson(a: string, b: string): boolean {
  const pa = parseName(a);
  const pb = parseName(b);
  if (!pa || !pb) return false;
  if (foldName(pa.surname) !== foldName(pb.surname)) return false;
  const ga = pa.given.map(foldName);
  const gb = pb.given.map(foldName);
  return ga.some((g) => gb.includes(g));
}

/**
 * Tá istá osoba, aj keď má jeden zápis SKRÁTENÉ priezvisko? Staré parsovanie
 * ORSR odrezávalo všetko za druhým slovom ("Alain Michel" namiesto "Alain Michel
 * Müller"), takže platí: tokeny jedného zápisu sú začiatkom druhého (min. 2
 * tokeny), alebo sa zhoduje priezvisko + krstné meno.
 */
export function looseSamePerson(a: string, b: string): boolean {
  if (samePerson(a, b)) return true;
  const pa = parseName(a);
  const pb = parseName(b);
  if (!pa || !pb) return false;
  const ta = foldName(pa.plain).split(" ");
  const tb = foldName(pb.plain).split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length >= 2 && short.every((t, i) => long[i] === t);
}

const FEMALE_NOT_A = new Set([
  "ester", "miriam", "ruth", "beatrix", "ines", "karin", "ingrid", "astrid",
  "carmen", "elisabeth", "margit", "dagmar", "gudrun", "edith", "iren",
  "nikol", "nicol", "viktoria", "vivien", "vivian",
]);

// Mená, ktoré nevieme spoľahlivo priradiť rodu (mužské zdrobneniny na -a a
// unisex mená) — radšej oslovenie bez "pán/pani" než zlý rod.
const AMBIGUOUS_FIRST = new Set([
  "nikola", "sasa", "luka", "kuba", "jirka", "honza", "vojta", "ilja", "sasha",
  "misa", "mischa", "andrea", "jona", "toma", "sava", "dusan-a", "kim", "sam",
  "alex", "robin", "dominik-a", "janis", "jean", "mario-a",
]);

/** "f" = žena, "m" = muž, null = nevieme (použije sa oslovenie bez pán/pani). */
export function genderOf(full: string): "f" | "m" | null {
  const p = parseName(full);
  if (!p) return null;
  const surname = foldName(p.surname);
  const first = foldName(p.given[0] ?? "");
  if (/ova$/.test(surname)) return "f"; // Nováková (aj bez diakritiky: Novakova)
  // Prídavné priezviská ženského rodu (Veselá, Novotná, Horská) — mužské na -á neexistujú.
  if (/á$/i.test(p.surname.normalize("NFC"))) return "f";
  if (AMBIGUOUS_FIRST.has(first)) return null;
  if (FEMALE_NOT_A.has(first)) return "f";
  if (/(a|ie)$/.test(first)) return "f"; // Jana, Eva, Lucie, Marie
  return "m";
}

/** Tituly, pri ktorých sa v slovenčine oslovuje "pán doktor / pani doktorka". */
const DOCTOR_TITLES = new Set(["judr", "mudr", "mddr", "mvdr"]);

export interface Greeting {
  /** Hotový riadok oslovenia vrátane čiarky, napr. "Dobrý deň, pán Ing. Novák,". */
  line: string;
  /** Vážený/vážená (odborník s titulom) → podpis "S úctou". */
  formal: boolean;
  /** Použili sme meno osoby (false = neutrálne "Dobrý deň,"). */
  personal: boolean;
}

/**
 * Oslovenie z OVERENÉHO mena. Bez mena, s neznámym rodom alebo s podozrivým
 * tvarom vráti neutrálne "Dobrý deň," — nikdy nehádaj.
 */
export function buildGreeting(fullName: string | null | undefined): Greeting {
  const neutral: Greeting = { line: "Dobrý deň,", formal: false, personal: false };
  if (!fullName) return neutral;
  // Obrana: meno s číslicami, zátvorkami, lomkami či zavináčom nie je meno osoby
  // (napr. ručne vložené "Palo (prezývka/meno z e-mailu)") → neutrálne oslovenie.
  if (!/^[\p{L}.\s,'’-]+$/u.test(fullName)) return neutral;
  const p = parseName(fullName);
  if (!p) return neutral;
  const looksLikeName = (t: string) => /^\p{Lu}[\p{L}'’-]+$/u.test(t);
  if (!looksLikeName(p.surname) || !p.given.every((t) => looksLikeName(t) || NAME_PARTICLES.has(t)))
    return neutral;
  const g = genderOf(fullName);
  if (!g) return neutral;

  const honorific = g === "f" ? "pani" : "pán";
  const titles = p.titlesBefore;
  const doctorTitle = titles.find((t) => DOCTOR_TITLES.has(foldName(t).replace(/\s/g, "")));

  if (doctorTitle) {
    const word = g === "f" ? "doktorka" : "doktor";
    const prefix = g === "f" ? "Vážená" : "Vážený";
    return {
      line: `${prefix} ${honorific} ${word} ${p.surname},`,
      formal: true,
      personal: true,
    };
  }
  const titleStr = titles.length ? `${titles.join(" ")} ` : "";
  return {
    line: `Dobrý deň, ${honorific} ${titleStr}${p.surname},`,
    formal: false,
    personal: true,
  };
}
