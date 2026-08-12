// Odkaz na obchodný register pre rýchle overenie konateľa firmy.
// CZ firmy → obchodní rejstřík (or.justice.cz, úplný výpis), SK firmy → ORSR.
// Čistá funkcia (bez závislostí) — použiteľná aj na klientovi.

export interface RegisterLink {
  url: string;
  label: string; // "Rejstřík" (CZ) | "ORSR" (SK)
  cz: boolean;
}

const CZ_KRAJE = [
  "praha",
  "středočeský",
  "jihočeský",
  "plzeňský",
  "karlovarský",
  "ústecký",
  "liberecký",
  "královéhradecký",
  "pardubický",
  "vysočina",
  "jihomoravský",
  "olomoucký",
  "zlínský",
  "moravskoslezský",
];

/** Odhad, či je firma česká — podľa krajiny, TLD webu, alebo kraja. */
function isCzech(lead: {
  country?: string | null;
  region?: string | null;
  websiteUrl?: string | null;
}): boolean {
  const c = (lead.country ?? "").toLowerCase();
  if (c.includes("czech") || c.includes("česk") || c === "cz") return true;
  if (c.includes("slovak") || c.includes("sloven") || c === "sk") return false;

  try {
    if (lead.websiteUrl) {
      const host = new URL(lead.websiteUrl).host.toLowerCase();
      if (host.endsWith(".cz")) return true;
      if (host.endsWith(".sk")) return false;
    }
  } catch {
    /* ignoruj nevalidný web */
  }

  const r = (lead.region ?? "").toLowerCase();
  if (CZ_KRAJE.some((k) => r.includes(k))) return true;
  return false; // default: SK
}

/**
 * Odkaz do obchodného registra pre daný lead. Ak firma nemá IČO, vráti odkaz na
 * vyhľadanie podľa názvu (menej presné, ale otvorí správny register).
 */
export function registerLink(lead: {
  ico?: string | null;
  country?: string | null;
  region?: string | null;
  websiteUrl?: string | null;
  companyName?: string | null;
}): RegisterLink {
  const cz = isCzech(lead);
  const ico = (lead.ico ?? "").replace(/\D/g, "");
  const name = (lead.companyName ?? "").trim();

  if (cz) {
    const base = "https://or.justice.cz/ias/ui/rejstrik-$firma";
    const url = ico
      ? `${base}?ico=${ico}`
      : `${base}?nazev=${encodeURIComponent(name)}`;
    return { url, label: "Rejstřík", cz: true };
  }

  const url = ico
    ? `https://www.orsr.sk/hladaj_ico.asp?ICO=${ico}&SID=0`
    : `https://www.orsr.sk/hladaj_subjekt.asp?OBMENO=${encodeURIComponent(name)}&PF=0&SID=0&R=on`;
  return { url, label: "ORSR", cz: false };
}
