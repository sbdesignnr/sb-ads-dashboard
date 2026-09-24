// Porovnanie názvu firmy z leadu s názvom v obchodnom registri. Cieľ: nikdy
// nepriradiť lead k INEJ firme. Predtým sa pri hľadaní podľa názvu bral prvý
// výsledok vyhľadávania bez kontroly, takže lead dostal konateľa cudzej firmy.

import { foldName } from "./person-name";

// Právne formy a spojky — do zhody sa nezapočítavajú.
const LEGAL_TOKENS = new Set([
  "spol", "as", "ks", "vos", "zo", "no", "oz", "sro", "se", "gmbh", "ltd", "inc",
  "llc", "kft", "sp", "zoo", "and", "the",
]);

// Všeobecné slová odvetví/lokalít: samotné nestačia na zhodu (veľa firiem sa
// volá "XY Reality", "Fyzio Centrum", "Stavby Slovensko"…).
const GENERIC_TOKENS = new Set([
  "reality", "realitna", "realitny", "kancelaria", "slovensko", "slovakia",
  "slovak", "czech", "ceska", "republika", "group", "holding", "studio",
  "servis", "service", "services", "fitness", "fyzio", "fyzioterapia",
  "centrum", "center", "clinic", "klinika", "advokatska", "advokat", "law",
  "office", "architekti", "architekt", "architektonicka", "stavby", "stavebna",
  "stavebne", "spolocnost", "company", "invest", "consulting", "trade", "profi",
  "pro", "plus", "international", "europe", "eu", "sk", "cz", "com", "dom",
  "hotel", "restauracia", "cafe", "kaviaren", "ucto", "uctovnictvo", "poradenstvo",
  "obchod", "development", "estate", "real", "management", "solutions",
]);

/** Významové tokeny názvu firmy (bez právnej formy, jednopísmenových skratiek). */
export function companyTokens(name: string): string[] {
  return foldName(name)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !LEGAL_TOKENS.has(t));
}

const specific = (tokens: string[]) => tokens.filter((t) => !GENERIC_TOKENS.has(t));

/**
 * Prísna zhoda (pri hľadaní registra podľa názvu, bez IČO): VŠETKY významové
 * tokeny registrového názvu musia byť v názve leadu. "Reality Bičiar" ↔
 * "reality BIČIAR, s.r.o." ✓; "Spadia" ↔ "Spadia s.r.o." ✓; "Jana Reality" ↔
 * "Reality s.r.o." ✗ (samé všeobecné slová sa vyžadujú celé).
 */
export function strictCompanyMatch(leadName: string, registryName: string): boolean {
  const lead = new Set(companyTokens(leadName));
  const reg = companyTokens(registryName);
  if (!reg.length || !lead.size) return false;
  const spec = specific(reg);
  if (spec.length) return spec.every((t) => lead.has(t));
  // Registrový názov je len zo všeobecných slov — vyžaduj rovnakú množinu.
  return reg.length === lead.size && reg.every((t) => lead.has(t));
}

/**
 * Voľná zhoda (pri IČO, ktoré už poznáme): stačí jeden spoločný významový token
 * alebo názov domény obsiahnutý v registrovom názve. Slúži len na odchytenie
 * zjavne cudzieho IČO (napr. IČO webagentúry v pätičke), nie na hľadanie firmy.
 */
export function plausibleSameCompany(
  leadName: string,
  registryName: string,
  websiteUrl?: string | null,
): boolean {
  const lead = specific(companyTokens(leadName));
  const reg = specific(companyTokens(registryName));
  if (lead.some((t) => reg.includes(t))) return true;
  // aj všeobecné slová, ak sa zhoduje celý názov
  if (strictCompanyMatch(leadName, registryName)) return true;
  if (websiteUrl) {
    try {
      const host = new URL(websiteUrl).hostname.replace(/^www\./, "").split(".")[0];
      const h = foldName(host).replace(/[\s-]/g, "");
      const regCompact = foldName(registryName).replace(/[\s-]/g, "");
      if (h.length >= 4 && (regCompact.includes(h) || reg.some((t) => t.length >= 4 && h.includes(t))))
        return true;
    } catch {
      /* neplatná URL */
    }
  }
  return false;
}

/** Rovnaké mesto? "Bratislava - Petržalka" ↔ "Bratislava", "Praha 4" ↔ "Praha". */
export function sameCity(a?: string | null, b?: string | null): boolean | null {
  if (!a || !b) return null; // neznáme — nevieme povedať
  const first = (s: string) => foldName(s).split(/[\s-]+/)[0];
  return first(a) === first(b);
}
