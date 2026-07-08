// CZ company enrichment via the official ARES REST API (ares.gov.cz).
// The Czech counterpart to lib/leads/orsr.ts — verifies a company and returns
// its IČO, address, city and whether it is still active. No API key needed.
//
// Owner/statutory info lives in a separate, heavily-nested "veřejný rejstřík"
// endpoint; the basic subject endpoint used here doesn't include it, so
// ownerName/ownerPosition stay null (the website + AI dossier fill those in).

const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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

/** Prefer an exact IČO match; fall back to a name search. Returns null on any failure. */
export async function enrichCompanyAres(input: {
  ico?: string | null;
  name?: string | null;
}): Promise<AresDetail | null> {
  const ico = input.ico ? normIco(input.ico) : null;
  if (ico) {
    const byIcoResult = await byIco(ico);
    if (byIcoResult) return byIcoResult;
  }
  if (input.name && input.name.trim().length >= 3) {
    return byName(input.name.trim());
  }
  return null;
}
