import { analyzeWebsite, type WebsiteAnalysis } from "./website-analyzer";

const PLACES_API = "https://places.googleapis.com/v1/places:searchText";

export class PlacesNotConfiguredError extends Error {
  constructor() {
    super("GOOGLE_PLACES_API_KEY nie je nastavený.");
    this.name = "PlacesNotConfiguredError";
  }
}

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!k) throw new PlacesNotConfiguredError();
  return k;
}

export interface PlaceBusiness {
  placeId: string;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: number | null;
}

interface PlaceResult {
  id?: string;
  displayName?: { text?: string };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  formattedAddress?: string;
  rating?: number;
  addressComponents?: { longText?: string; types?: string[] }[];
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.formattedAddress",
  "places.rating",
  "places.addressComponents",
  "nextPageToken",
].join(",");

export function cityOf(p: PlaceResult): string | null {
  const comps = p.addressComponents ?? [];
  const byType = (t: string) => comps.find((a) => a.types?.includes(t))?.longText ?? null;
  return byType("locality") ?? byType("postal_town") ?? byType("administrative_area_level_2");
}

export function mapPlace(p: PlaceResult): PlaceBusiness {
  return {
    placeId: p.id ?? "",
    name: p.displayName?.text ?? "",
    website: p.websiteUri ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    address: p.formattedAddress ?? null,
    city: cityOf(p),
    rating: typeof p.rating === "number" ? p.rating : null,
  };
}

/**
 * Text Search on the (new) Places API for a query like
 * "realitná kancelária Slovensko". Returns only businesses that HAVE a website
 * (a site is required to assess how outdated it is).
 */
export async function searchBusinesses(
  query: string,
  opts: { maxPages?: number } = {},
): Promise<PlaceBusiness[]> {
  const apiKey = key();
  const maxPages = Math.max(1, Math.min(3, opts.maxPages ?? 1));
  const out: PlaceBusiness[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      regionCode: "SK",
      languageCode: "sk",
      pageSize: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    let res: Response;
    try {
      res = await fetch(PLACES_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      break;
    }
    if (!res.ok) break;

    const data = (await res.json()) as { places?: PlaceResult[]; nextPageToken?: string };
    for (const p of data.places ?? []) {
      if (!p.websiteUri) continue; // only companies with a website
      const b = mapPlace(p);
      if (b.name && !out.find((x) => x.placeId === b.placeId)) out.push(b);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

export interface QualifiedLead extends PlaceBusiness {
  analysis: WebsiteAnalysis;
}

/**
 * Search + analyze each business's website, keeping only qualified (outdated,
 * score >= 40) ones. Persisting + ORSR enrichment is done by the scanner.
 */
export async function searchQualifiedLeads(
  query: string,
  opts: { maxPages?: number } = {},
): Promise<QualifiedLead[]> {
  const businesses = await searchBusinesses(query, opts);
  const out: QualifiedLead[] = [];
  for (const b of businesses) {
    if (!b.website) continue;
    const analysis = await analyzeWebsite(b.website);
    if (analysis.qualified) out.push({ ...b, analysis });
  }
  return out;
}
