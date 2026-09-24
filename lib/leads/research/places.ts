// Google Places API (New) pre výskum: profil firmy (hodnotenie, recenzie, otváracie
// hodiny) a konkurenti v meste. Všetko sú overiteľné verejné údaje z Google Máp.

import { hostOf } from "./web";

const SEARCH = "https://places.googleapis.com/v1/places:searchText";

function key(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export interface PlaceReview {
  rating: number | null;
  text: string;
  when: string;
}

export interface PlaceProfile {
  placeId: string;
  name: string;
  address: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  status: string | null;
  mapsUrl: string | null;
  summary: string | null;
  type: string | null;
  hours: string[];
  photos: number;
  reviews: PlaceReview[];
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  editorialSummary?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: unknown[];
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
  }[];
}

async function search(
  textQuery: string,
  fields: string[],
  max: number,
): Promise<RawPlace[]> {
  const k = key();
  if (!k) return [];
  try {
    const res = await fetch(SEARCH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": k,
        "X-Goog-FieldMask": fields.map((f) => `places.${f}`).join(","),
      },
      body: JSON.stringify({ textQuery, maxResultCount: max, languageCode: "sk" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { places?: RawPlace[] };
    return j.places ?? [];
  } catch {
    return [];
  }
}

function toProfile(p: RawPlace): PlaceProfile {
  return {
    placeId: p.id ?? "",
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
    website: p.websiteUri ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    status: p.businessStatus ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    summary: p.editorialSummary?.text ?? null,
    type: p.primaryTypeDisplayName?.text ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    photos: p.photos?.length ?? 0,
    reviews: (p.reviews ?? []).map((r) => ({
      rating: typeof r.rating === "number" ? r.rating : null,
      text: (r.originalText?.text ?? r.text?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 320),
      when: r.relativePublishTimeDescription ?? "",
    })),
  };
}

const PROFILE_FIELDS = [
  "id", "displayName", "formattedAddress", "websiteUri", "rating", "userRatingCount",
  "businessStatus", "googleMapsUri", "editorialSummary", "primaryTypeDisplayName",
  "regularOpeningHours", "photos", "reviews",
];

/** Google profil firmy: hľadá sa podľa názvu + mesta, výsledok sa páruje podľa domény webu. */
export async function findPlaceProfile(
  companyName: string,
  city: string | null,
  websiteUrl: string | null,
): Promise<PlaceProfile | null> {
  const results = await search(`${companyName} ${city ?? ""}`.trim(), PROFILE_FIELDS, 5);
  if (!results.length) return null;
  const host = websiteUrl ? hostOf(websiteUrl) : "";
  const match =
    (host && results.find((r) => r.websiteUri && hostOf(r.websiteUri) === host)) ?? null;
  // Bez zhody domény radšej nič než profil inej firmy.
  return match ? toProfile(match) : null;
}

export interface Competitor {
  placeId: string;
  name: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
}

/** Firmy toho istého odboru v tom istom meste (bez samotného leadu). */
export async function searchCompetitors(
  keyword: string,
  city: string,
  excludeHost: string,
  limit = 12,
): Promise<Competitor[]> {
  const results = await search(
    `${keyword} ${city}`,
    ["id", "displayName", "websiteUri", "rating", "userRatingCount", "formattedAddress", "businessStatus"],
    20,
  );
  return results
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => ({
      placeId: p.id ?? "",
      name: p.displayName?.text ?? "",
      website: p.websiteUri ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      address: p.formattedAddress ?? null,
    }))
    .filter((c) => c.name && (!c.website || hostOf(c.website) !== excludeHost))
    .slice(0, limit);
}
