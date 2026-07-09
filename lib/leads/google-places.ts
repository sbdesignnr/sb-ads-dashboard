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

export type Region = "SK" | "CZ";

export interface PlaceBusiness {
  placeId: string;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: number | null;
  country: Region | null; // which region's search returned it (routes ORSR vs ARES)
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
    country: null,
  };
}

/**
 * Text Search on the (new) Places API for a query like
 * "realitná kancelária Slovensko". Returns only businesses that HAVE a website
 * (a site is required to assess how outdated it is).
 */
export async function searchBusinesses(
  query: string,
  opts: { maxPages?: number; region?: Region } = {},
): Promise<PlaceBusiness[]> {
  const apiKey = key();
  const maxPages = Math.max(1, Math.min(3, opts.maxPages ?? 1));
  const region: Region = opts.region ?? "SK";
  const out: PlaceBusiness[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      regionCode: region,
      languageCode: region === "CZ" ? "cs" : "sk",
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
      if (b.name && !out.find((x) => x.placeId === b.placeId)) out.push({ ...b, country: region });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

// Biggest Slovak population centres, roughly largest-first. Text Search is
// biased toward one area per query, so we sweep cities to cover the whole market.
export const SK_CITIES = [
  "Bratislava", "Košice", "Prešov", "Žilina", "Nitra", "Banská Bystrica",
  "Trnava", "Trenčín", "Martin", "Poprad", "Prievidza", "Zvolen",
  "Považská Bystrica", "Nové Zámky", "Michalovce", "Spišská Nová Ves",
  "Komárno", "Levice", "Humenné", "Bardejov", "Liptovský Mikuláš", "Ružomberok",
];

// Biggest Czech population centres, roughly largest-first.
export const CZ_CITIES = [
  "Praha", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc",
  "České Budějovice", "Hradec Králové", "Ústí nad Labem", "Pardubice",
  "Zlín", "Havířov", "Kladno", "Most", "Karviná", "Opava",
  "Frýdek-Místek", "Jihlava", "Teplice", "Karlovy Vary", "Děčín", "Chomutov",
];

// A region (kraj) to sweep, tagged with the country it belongs to (drives the
// Places regionCode/languageCode and the SK↔CZ keyword variant).
export interface RegionArea {
  name: string;
  country: Region;
}

// Slovak self-governing regions (8).
export const SK_REGIONS: RegionArea[] = [
  "Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj", "Nitriansky kraj",
  "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj",
].map((name) => ({ name, country: "SK" as const }));

// Czech regions (14, incl. Praha).
export const CZ_REGIONS: RegionArea[] = [
  "Praha", "Středočeský kraj", "Jihočeský kraj", "Plzeňský kraj", "Karlovarský kraj",
  "Ústecký kraj", "Liberecký kraj", "Královéhradecký kraj", "Pardubický kraj",
  "Kraj Vysočina", "Jihomoravský kraj", "Olomoucký kraj", "Zlínský kraj", "Moravskoslezský kraj",
].map((name) => ({ name, country: "CZ" as const }));

// Combined SK + CZ list (22) — the default rotation for a "both" scan.
export const ALL_REGIONS: RegionArea[] = [...SK_REGIONS, ...CZ_REGIONS];

/** The region list a scan rotates over, by selected region filter. */
export function regionsFor(region: Region | "both"): RegionArea[] {
  return region === "SK" ? SK_REGIONS : region === "CZ" ? CZ_REGIONS : ALL_REGIONS;
}

// SK keyword → CZ keyword. Many are identical (advokát, hotel, fitness…); only the
// ones that differ need an entry. Falls back to the SK keyword when unmapped.
const CZ_KEYWORDS: Record<string, string> = {
  "reštaurácia": "restaurace",
  "stavebná firma": "stavební firma",
  "realitná kancelária": "realitní kancelář",
  "účtovník": "účetní",
  "psychológ": "psycholog",
  "kozmetický salón": "kosmetický salon",
  "zubár": "zubař",
  "veterinár": "veterinář",
  "kvetinárstvo": "květinářství",
};

/** CZ variant of a (Slovak) keyword for Czech-region queries. */
export function czKeyword(sk: string): string {
  return CZ_KEYWORDS[sk.trim().toLowerCase()] ?? sk;
}

/**
 * The window of regions to scan this run: `size` regions starting at `offset`
 * (clamped into range). Returns the slice AND the next offset (0 once the list
 * has been fully swept) so the caller can persist the rotation cursor.
 */
export function regionWindow(
  regions: RegionArea[],
  offset: number,
  size = 3,
): { window: RegionArea[]; nextOffset: number } {
  if (regions.length === 0) return { window: [], nextOffset: 0 };
  const start = ((offset % regions.length) + regions.length) % regions.length;
  const window = regions.slice(start, start + size);
  const nextOffset = start + size >= regions.length ? 0 : start + size;
  return { window, nextOffset };
}

function normWebsite(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase().replace(/^www\./, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Discovery across keywords × the given regions (kraje), deduped by website host.
 * Each Czech region uses the CZ keyword variant + regionCode CZ. Stops as soon as
 * it reaches `cap`.
 */
export async function discoverBusinessesByRegions(
  keywords: string[],
  regions: RegionArea[],
  opts: { cap?: number; maxPagesPerQuery?: number } = {},
): Promise<PlaceBusiness[]> {
  const cap = opts.cap ?? 80;
  const maxPages = opts.maxPagesPerQuery ?? 1;
  const kws = keywords.length ? keywords : ["firma"];

  const seen = new Set<string>();
  const out: PlaceBusiness[] = [];
  const add = (list: PlaceBusiness[]) => {
    for (const b of list) {
      if (!b.website) continue;
      const host = normWebsite(b.website);
      if (seen.has(host)) continue; // dedupe by domain, across SK + CZ
      seen.add(host);
      out.push({ ...b });
      if (out.length >= cap) return true;
    }
    return false;
  };

  for (const area of regions) {
    for (const kw of kws) {
      if (out.length >= cap) return out;
      const q = area.country === "CZ" ? czKeyword(kw) : kw;
      if (add(await searchBusinesses(`${q} ${area.name}`, { maxPages, region: area.country }))) return out;
    }
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
