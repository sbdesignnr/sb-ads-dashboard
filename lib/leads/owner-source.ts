// Pôvod mena kontaktnej osoby na leade. Čistý modul bez závislostí, aby ho mohol
// použiť aj klientský kód (badge v UI) aj server (e-maily, šablóny).
//
// Meno sa v e-maile použije LEN ak je overené:
//   registry — osoba je v štatutárnom orgáne firmy v ORSR/ARES (presné IČO)
//   website  — celé meno je na vlastnom webe firmy v spojení s vedúcou rolou
//   manual   — meno zadal/potvrdil používateľ ručne
// Všetko ostatné (CSV import, AI z textu webu, staré dáta bez pôvodu) je NEOVERENÉ
// a oslovenie ide bez mena ("Dobrý deň,") — radšej bez mena než so zlým.

export const OWNER_SOURCES = ["registry", "website", "manual"] as const;
export type OwnerSource = (typeof OWNER_SOURCES)[number];

export function isVerifiedOwnerSource(
  source: string | null | undefined,
): source is OwnerSource {
  return (OWNER_SOURCES as readonly string[]).includes(source ?? "");
}

/** Meno, ktoré sa smie použiť v oslovení (inak null → neutrálne oslovenie). */
export function greetableOwnerName(lead: {
  ownerName?: string | null;
  ownerSource?: string | null;
}): string | null {
  const name = lead.ownerName?.trim();
  return name && isVerifiedOwnerSource(lead.ownerSource) ? name : null;
}

export const OWNER_SOURCE_LABEL: Record<OwnerSource, string> = {
  registry: "overené v obchodnom registri",
  website: "uvedené na webe firmy",
  manual: "potvrdené ručne",
};
