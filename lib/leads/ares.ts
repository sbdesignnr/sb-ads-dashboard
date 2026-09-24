// CZ company enrichment via the official ARES REST API (ares.gov.cz).
// The Czech counterpart to lib/leads/orsr.ts — verifies a company and returns
// its IČO, address, city, whether it is still active, AND the statutory body
// (jednatel / member of the board) pulled from the "veřejný rejstřík" endpoint.
// No API key needed.

import { looseSamePerson } from "./person-name";
import {
  plausibleSameCompany,
  sameCity,
  strictCompanyMatch,
} from "./company-match";
import type { RegistryMatchType, RegistryPerson } from "./orsr";

const ARES_BASE =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
// Veřejný rejstřík — nested, includes statutory bodies (owner/konateľ).
const ARES_VR =
  "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr";

export interface AresDetail {
  ico: string | null;
  address: string | null;
  city: string | null;
  /** Všetci AKTUÁLNI členovia štatutárneho orgánu (alebo podnikateľ-OSVČ). */
  owners: RegistryPerson[];
  /** Prvý z `owners` (spätná kompatibilita). */
  ownerName: string | null;
  ownerPosition: string | null;
  active: boolean;
  statusNote: string | null; // e.g. "zaniklá"
}

interface AresSubject {
  ico?: string;
  obchodniJmeno?: string;
  pravniForma?: string;
  sidlo?: { textovaAdresa?: string; nazevObce?: string };
  datumZaniku?: string;
}

// Meno v ARES býva CAPSLOCKom (ALEŠ ZAVORAL) — sprav z neho normálne "Aleš Zavoral".
const titleCase = (s?: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/(^|[\s-])([\p{L}])/gu, (_, sep, ch) => sep + ch.toUpperCase())
    .trim();

function mapSubject(s: AresSubject): AresDetail & { registeredName: string } {
  const active = !s.datumZaniku;
  return {
    ico: s.ico ?? null,
    address: s.sidlo?.textovaAdresa ?? null,
    city: s.sidlo?.nazevObce ?? null,
    owners: [],
    ownerName: null,
    ownerPosition: null,
    active,
    statusNote: active ? null : "zaniklá",
    registeredName: s.obchodniJmeno ?? "",
  };
}

/** Normalise a Czech IČO to 8 digits (they're often stored without leading zeros). */
function normIco(ico: string): string | null {
  const digits = ico.replace(/\D/g, "");
  if (!digits || digits.length > 8) return null;
  return digits.padStart(8, "0");
}

async function subjectByIco(ico: string): Promise<AresSubject | null> {
  try {
    const res = await fetch(`${ARES_BASE}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as AresSubject;
    return j.ico ? j : null;
  } catch {
    return null;
  }
}

async function subjectsByName(name: string): Promise<AresSubject[]> {
  try {
    const res = await fetch(`${ARES_BASE}/vyhledat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ obchodniJmeno: name, pocet: 10, start: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { ekonomickeSubjekty?: AresSubject[] };
    return (j.ekonomickeSubjekty ?? []).filter((s) => s.ico);
  } catch {
    return [];
  }
}

// ── Statutory body (konateľ / jednatel) from the veřejný rejstřík ──────────────
// VR záznam nesie históriu: člen s `datumVymazu` už vo funkcii nie je. Berieme
// VŠETKÝCH aktuálnych členov (bez dátumu výmazu). Skutočná štruktúra:
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
  return [fo.titulPredJmenem, titleCase(fo.jmeno), titleCase(fo.prijmeni), fo.titulZaJmenem]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Vytiahne všetkých aktuálnych členov štatutárneho orgánu (meno + funkcia). */
function pickStatutory(vr: { zaznamy?: VrZaznam[] }): RegistryPerson[] {
  const out: RegistryPerson[] = [];
  const zaznam = vr.zaznamy?.[0];
  for (const organ of zaznam?.statutarniOrgany ?? []) {
    if (organ.datumVymazu) continue;
    for (const clen of organ.clenoveOrganu ?? []) {
      if (clen.datumVymazu || !clen.fyzickaOsoba) continue;
      const name = formatName(clen.fyzickaOsoba);
      if (!name) continue;
      const role = clen.clenstvi?.funkce?.nazev ?? organ.nazevOrganu ?? null;
      out.push({ name, position: role ? role.trim().toLowerCase() : null });
    }
  }
  return out;
}

async function statutoryByIco(ico: string): Promise<RegistryPerson[]> {
  try {
    const res = await fetch(`${ARES_VR}/${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    return pickStatutory((await res.json()) as { zaznamy?: VrZaznam[] });
  } catch {
    return [];
  }
}

// Fyzická osoba podnikající dle živnostenského zákona (OSVČ): v ARES je
// obchodní jméno = jméno podnikatele, takže vlastník je overiteľne tá osoba.
const PRAVNI_FORMA_OSVC = "101";

async function withOwners(
  subject: AresSubject,
): Promise<AresDetail & { registeredName: string }> {
  const base = mapSubject(subject);
  const ico = base.ico ? normIco(base.ico) : null;
  let owners: RegistryPerson[] = [];
  if (ico) owners = await statutoryByIco(ico);
  if (!owners.length && subject.pravniForma === PRAVNI_FORMA_OSVC && subject.obchodniJmeno) {
    owners = [{ name: titleCase(subject.obchodniJmeno), position: "podnikateľ" }];
  }
  base.owners = owners;
  base.ownerName = owners[0]?.name ?? null;
  base.ownerPosition = owners[0]?.position ?? null;
  return base;
}

/**
 * Overenie firmy v ARES pre konateľa. S IČO presná zhoda (`nameMatches` hovorí,
 * či aj názov sedí); bez IČO hľadanie podľa názvu, ktoré sa NIKDY neberie
 * naslepo: prísna zhoda názvu + rovnaké mesto, jediný kandidát — inak null.
 */
export async function enrichCompanyAres(input: {
  ico?: string | null;
  name?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
  trustIco?: boolean;
  /** Kontakt z importu — ak je v štatutárnom orgáne, firma je overená aj pri inom meste. */
  personName?: string | null;
}): Promise<
  | (AresDetail & {
      matchedName: string;
      matchType: RegistryMatchType;
      nameMatches: boolean;
    })
  | null
> {
  const ico = input.ico ? normIco(input.ico) : null;

  if (ico) {
    const subject = await subjectByIco(ico);
    if (!subject) return null;
    const nameMatches =
      Boolean(input.trustIco) ||
      !input.name ||
      plausibleSameCompany(input.name, subject.obchodniJmeno ?? "", input.websiteUrl);
    const d = await withOwners(subject);
    return { ...d, matchedName: d.registeredName, matchType: "ico", nameMatches };
  }

  if (!input.name || input.name.trim().length < 3) return null;
  const subjects = await subjectsByName(input.name.trim());
  const candidates = subjects.filter(
    (s) => s.obchodniJmeno && strictCompanyMatch(input.name!, s.obchodniJmeno),
  );
  type Found = AresDetail & {
    matchedName: string;
    matchType: RegistryMatchType;
    nameMatches: boolean;
  };
  const accepted: { found: Found; personMatch: boolean }[] = [];
  for (const sub of candidates.slice(0, 3)) {
    const d = await withOwners(sub);
    const city = sameCity(input.city, sub.sidlo?.nazevObce);
    const personMatch = Boolean(
      input.personName && d.owners.some((o) => looseSamePerson(o.name, input.personName!)),
    );
    if (!personMatch) {
      if (city === false) continue;
      if (city === null && candidates.length > 1) continue;
    }
    accepted.push({
      found: { ...d, matchedName: d.registeredName, matchType: "name", nameMatches: true },
      personMatch,
    });
  }
  const byPerson = accepted.filter((a) => a.personMatch);
  if (byPerson.length === 1) return byPerson[0].found;
  return accepted.length === 1 ? accepted[0].found : null; // nejednoznačné alebo nič → radšej nič
}
