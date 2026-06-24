import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SEED_KEYWORDS,
  getKeywordIdeas,
  getMockKeywordIdeas,
} from "@/lib/keywords/keyword-planner";
import { GoogleAdsNotConnectedError } from "@/lib/google-ads/middleware";
import type { KeywordIdea, KeywordIdeasResponse } from "@/lib/keywords/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_LIMIT = 120;
const NEGATIVE_TTL = 10 * 60 * 1000; // after a failed live attempt, skip the slow API for 10 min

// Remembers a recent live-API failure so we don't re-attempt the slow call on every visit.
let apiUnavailableUntil = 0;

type CacheRow = { keyword: string; volume: number; competition: string; cpc: number; updatedAt: Date };

function rowToIdea(r: CacheRow): KeywordIdea {
  return {
    keyword: r.keyword,
    avgMonthlySearches: r.volume,
    competition: (["LOW", "MEDIUM", "HIGH"].includes(r.competition)
      ? r.competition
      : "UNKNOWN") as KeywordIdea["competition"],
    avgCpc: r.cpc,
  };
}

function latest(rows: CacheRow[]): string | null {
  if (!rows.length) return null;
  return new Date(Math.max(...rows.map((r) => r.updatedAt.getTime()))).toISOString();
}

function extractReason(err: unknown): string {
  if (err instanceof GoogleAdsNotConnectedError) return "not_connected";
  const e = err as { message?: string; errors?: { message?: string }[] };
  if (e?.errors?.[0]?.message) return e.errors[0].message as string;
  if (e?.message) return e.message;
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}") return s.slice(0, 200);
  } catch {
    /* ignore */
  }
  return "api_error";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "true";
  const param = url.searchParams.get("keywords");
  const seeds = param
    ? param
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_SEED_KEYWORDS;

  // 1) Serve fresh cache (< 24h) unless an explicit refresh was requested.
  if (!refresh) {
    const fresh = await prisma.keywordCache.findMany({
      where: { updatedAt: { gte: new Date(Date.now() - CACHE_MS) } },
      orderBy: { volume: "desc" },
      take: CACHE_LIMIT,
    });
    if (fresh.length) {
      const body: KeywordIdeasResponse = {
        source: "google-ads",
        cached: true,
        updatedAt: latest(fresh),
        keywords: fresh.map(rowToIdea),
      };
      return NextResponse.json(body);
    }
  }

  // Shared fallback: stale-but-real cache if present, otherwise mock.
  const buildFallback = async (reason: string): Promise<NextResponse> => {
    const stale = await prisma.keywordCache.findMany({ orderBy: { volume: "desc" }, take: CACHE_LIMIT });
    if (stale.length) {
      const body: KeywordIdeasResponse = {
        source: "google-ads",
        cached: true,
        stale: true,
        updatedAt: latest(stale),
        keywords: stale.map(rowToIdea),
      };
      return NextResponse.json(body);
    }
    const body: KeywordIdeasResponse = {
      source: "mock",
      cached: false,
      updatedAt: null,
      keywords: getMockKeywordIdeas(),
      error: reason,
    };
    return NextResponse.json(body);
  };

  // 2) Skip the (potentially slow) live call if a recent attempt failed.
  if (!refresh && Date.now() < apiUnavailableUntil) {
    return buildFallback("api_recently_unavailable");
  }

  // 3) Live fetch from Google Ads, cache, and return.
  try {
    const ideas = await getKeywordIdeas(seeds);
    if (!ideas.length) throw new Error("no_keyword_ideas");

    const toCache = ideas.slice(0, CACHE_LIMIT);
    await Promise.all(
      toCache.map((i) =>
        prisma.keywordCache.upsert({
          where: { keyword: i.keyword },
          update: { volume: i.avgMonthlySearches, competition: i.competition, cpc: i.avgCpc, updatedAt: new Date() },
          create: { keyword: i.keyword, volume: i.avgMonthlySearches, competition: i.competition, cpc: i.avgCpc },
        }),
      ),
    );

    apiUnavailableUntil = 0; // success — clear any negative cache
    const body: KeywordIdeasResponse = {
      source: "google-ads",
      cached: false,
      updatedAt: new Date().toISOString(),
      keywords: ideas,
    };
    return NextResponse.json(body);
  } catch (err) {
    const reason = extractReason(err);
    apiUnavailableUntil = Date.now() + NEGATIVE_TTL;
    console.warn(`[keywords] Keyword Planner unavailable: ${reason}`);
    return buildFallback(reason);
  }
}
