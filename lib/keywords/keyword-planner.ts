import { enums } from "google-ads-api";
import { getConfiguredCustomerId, getCustomerClient } from "@/lib/google-ads/client";
import { ensureFreshAccessToken, getStoredToken } from "@/lib/google-ads/auth";
import { GoogleAdsNotConnectedError } from "@/lib/google-ads/middleware";
import { expensiveKeywords, longTailKeywords } from "@/lib/mock-data/keywords";
import type { KeywordCompetition, KeywordIdea } from "./types";

// Slovak language + Slovakia geo-target criteria IDs (overridable via env).
const LANGUAGE_ID = process.env.GOOGLE_ADS_LANGUAGE_ID || "1033"; // Slovak
const GEO_TARGET_ID = process.env.GOOGLE_ADS_GEO_TARGET_ID || "2703"; // Slovakia

export const DEFAULT_SEED_KEYWORDS = [
  "tvorba webstranky",
  "web developer",
  "digitálny marketing",
  "google reklama",
  "facebook reklama",
  "eshop",
  "wordpress web",
  "seo optimalizacia",
];

function normalizeCompetition(v: unknown): KeywordCompetition {
  if (typeof v === "number") {
    return ({ 2: "LOW", 3: "MEDIUM", 4: "HIGH" } as Record<number, KeywordCompetition>)[v] ?? "UNKNOWN";
  }
  const s = String(v ?? "").toUpperCase();
  return s === "LOW" || s === "MEDIUM" || s === "HIGH" ? s : "UNKNOWN";
}

const fromMicros = (v: unknown) => Number(v ?? 0) / 1_000_000;

/**
 * Fetch keyword ideas from Google Ads KeywordPlanIdeaService.
 * Throws GoogleAdsNotConnectedError when no account is connected, or the
 * underlying API error (caught upstream → fallback to mock/cache).
 */
export async function getKeywordIdeas(
  seedKeywords: string[] = DEFAULT_SEED_KEYWORDS,
  _language: "sk" = "sk",
  _location: "Slovakia" = "Slovakia",
): Promise<KeywordIdea[]> {
  const token = await getStoredToken();
  if (!token?.refreshToken) throw new GoogleAdsNotConnectedError();
  await ensureFreshAccessToken();

  const customerId = getConfiguredCustomerId() ?? undefined;
  const customer = getCustomerClient(token.refreshToken, customerId);

  // Cast the request — the library's generated request type is very strict and
  // the snake_case field names match the proto.
  const request = {
    customer_id: customerId,
    language: `languageConstants/${LANGUAGE_ID}`,
    geo_target_constants: [`geoTargetConstants/${GEO_TARGET_ID}`],
    include_adult_keywords: false,
    keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
    keyword_seed: { keywords: seedKeywords.filter(Boolean) },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = await customer.keywordPlanIdeas.generateKeywordIdeas(request as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = Array.isArray(response) ? response : (response?.results ?? []);

  const ideas: KeywordIdea[] = results
    .map((r) => {
      const m = r.keyword_idea_metrics ?? {};
      const low = fromMicros(m.low_top_of_page_bid_micros);
      const high = fromMicros(m.high_top_of_page_bid_micros);
      const cpc = low && high ? (low + high) / 2 : high || low || 0;
      return {
        keyword: String(r.text ?? "").trim(),
        avgMonthlySearches: Number(m.avg_monthly_searches ?? 0),
        competition: normalizeCompetition(m.competition),
        avgCpc: Math.round(cpc * 100) / 100,
      };
    })
    .filter((i) => i.keyword.length > 0);

  return ideas.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches).slice(0, 200);
}

/** Deterministic mock ideas (reuses the curated Keyword Intelligence dataset). */
export function getMockKeywordIdeas(): KeywordIdea[] {
  const bucket = (c: number): KeywordCompetition =>
    c < 0.34 ? "LOW" : c < 0.67 ? "MEDIUM" : "HIGH";

  const map = (k: { keyword: string; searchVolume: number; competition: number; avgCPC: number }) => ({
    keyword: k.keyword,
    avgMonthlySearches: k.searchVolume,
    competition: bucket(k.competition),
    avgCpc: k.avgCPC,
  });

  return [...expensiveKeywords.map(map), ...longTailKeywords.map(map)].sort(
    (a, b) => b.avgMonthlySearches - a.avgMonthlySearches,
  );
}
