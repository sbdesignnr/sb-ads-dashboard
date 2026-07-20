// CZ company enrichment via the official ARES REST API (ares.gov.cz).
// The Czech counterpart to lib/leads/orsr.ts — verifies a company and returns
// its IČO, address, city, whether it is still active, AND the statutory body
// (jednatel / member of the board) pulled from the "veřejný rejstřík" endpoint.
// No API key needed.

const ARES_BASE =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
// Veřejný rejstřík — nested, includes statutory bodies (owner/konateľ).
const ARES_VR =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr";

export interface AresDetail {
  ico: string | null;
  address: string | null;
  city: string | null;
  ownerName: string | null;
  ownerPosition: string | null;
  active: boolean;
  statusNote: string | null; // e.g. "zaniklá"
}

interface AresSubject {
  ico?: string;
  obchodniJmeno?: string;
  sidlo?: { textovaAdresa?: string; nazevObce?: string };
  datumZaniku?: string;
}

function mapSubject(s: AresSubject): AresDetail {
  const active = !s.datumZaniku;
  return {
    ico: s.ico ?? null,
    address: s.sidlo?.textovaAdresa ?? null,
    city: s.sidlo?.nazevObce ?? null,
    ownerName: null,
    ownerPosition: null,
    active,
    statusNote: active ? null : "zaniklá",
  };
}

/** Normalise a Czech IČO to 8 digits (they're often stored without leading zeros). */
function normIco(ico: string): string | null {
  const digits = ico.replace(/\D/g, "");
  if (!digits || digits.length > 8) return null;
  return digits.padStart(8, "0");
}

async function byIco(ico: string): Promise<AresDetail | null> {
  try {
    const res = await fetch(`${ARES_BASE}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as AresSubject;
    return j.ico ? mapSubject(j) : null;
  } catch {
    return null;
  }
}

async function byName(name: string): Promise<AresDetail | null> {
  try {
    const res = await fetch(`${ARES_BASE}/vyhledat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ obchodniJmeno: name, pocet: 5, start: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ekonomickeSubjekty?: AresSubject[] };
    const first = j.ekonomickeSubjekty?.find((s) => s.ico);
    return first ? mapSubject(first) : null;
  } catch {
    return null;
  }
}

// ── Statutory body (konateľ / jednatel) from the veřejný rejstřík ──────────────
// VR záznam nesie históriu: člen s `datumVymazu` už vo funkcii nie je. Berieme
// prvého AKTUÁLNEHO člena (bez dátumu výmazu). Skutočná štruktúra:
//   zaznamy[0].statutarniOrgany[].clenoveOrganu[]
//     .fyzickaOsoba { titulPredJmenem, jmeno, prijmeni, titulZaJmenem }
//     .clenstvi.funkce.nazev  (napr. "Předseda představenstva", "jednatel")

interface VrClen {
  datumVymazu?: string;
  fyzickaOsoba?: {
    titulPredJmenem?: string;
    jmeno?: string;
    prijmeni?: string;
    titulZaJmenem?: string;
  };
  clenstvi?: { funkce?: { nazev?: string } };
  nazevAngazma?: string;
}
interface VrOrgan {
  datumVymazu?: string;
  nazevOrganu?: string;
  clenoveOrganu?: VrClen[];
}
interface VrZaznam {
  statutarniOrgany?: VrOrgan[];
}

function formatName(fo: NonNullable<VrClen["fyzickaOsoba"]>): string {
  // Meno v ARES býva CAPSLOCKom (ALEŠ ZAVORAL) — sprav z neho normálne "Aleš Zavoral".
  const tc = (s?: string) =>
    (s ?? "")
      .toLowerCase()
      .replace(/(^|[\s-])([\p{L}])/gu, (_, sep, ch) => sep + ch.toUpperCase())
      .trim();
  return [fo.titulPredJmenem, tc(fo.jmeno), tc(fo.prijmeni), fo.titulZaJmenem]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Vytiahne prvého aktuálneho člena štatutárneho orgánu (meno + funkcia). */
function pickStatutory(vr: {
  zaznamy?: VrZaznam[];
}): { name: string; role: string | null } | null {
  const zaznam = vr.zaznamy?.[0];
  for (const organ of zaznam?.statutarniOrgany ?? []) {
    if (organ.datumVymazu) continue;
    for (const clen of organ.clenoveOrganu ?? []) {
      if (clen.datumVymazu || !clen.fyzickaOsoba) continue;
      const name = formatName(clen.fyzickaOsoba);
      if (!name) continue;
      const role = clen.clenstvi?.funkce?.nazev ?? organ.nazevOrganu ?? null;
      return { name, role: role ? role.trim() : null };
    }
  }
  return null;
}

async function statutoryByIco(
  ico: string,
): Promise<{ name: string; role: string | null } | null> {
  try {
    const res = await fetch(`${ARES_VR}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return pickStatutory((await res.json()) as { zaznamy?: VrZaznam[] });
  } catch {
    return null;
  }
}

/** Prefer an exact IČO match; fall back to a name search. Returns null on any failure. */
export async function enrichCompanyAres(input: {
  ico?: string | null;
  name?: string | null;
}): Promise<AresDetail | null> {
  const ico = input.ico ? normIco(input.ico) : null;
  let base: AresDetail | null = null;
  if (ico) base = await byIco(ico);
  if (!base && input.name && input.name.trim().length >= 3) {
    base = await byName(input.name.trim());
  }
  if (!base) return null;

  // Konateľa vieme dotiahnuť len cez IČO (VR endpoint je indexovaný podľa IČO).
  const lookupIco = base.ico ? normIco(base.ico) : ico;
  if (lookupIco) {
    const stat = await statutoryByIco(lookupIco);
    if (stat) {
      base.ownerName = stat.name;
      base.ownerPosition = stat.role;
    }
  }
  return base;
}
