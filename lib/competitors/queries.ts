import { prisma } from "@/lib/prisma";
import { BLOG_TOPIC_POOL } from "./constants";
import type {
  BlogPost,
  CompetitorAnalysis,
  ScanChange,
  ThreatLevel,
  WeeklyReport,
} from "./types";

export interface ScanRecord {
  id: string;
  scannedAt: string;
  services: string[];
  pricing: string[];
  blogPosts: BlogPost[];
  techStack: string[];
  changes: ScanChange[];
  analysis: CompetitorAnalysis | null;
}

export interface CompetitorListItem {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  lastScanned: string | null;
  latestScan: ScanRecord | null;
}

export interface CompetitorDetailData {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  lastScanned: string | null;
  scans: ScanRecord[];
}

function parseAnalysis(raw: string | null): CompetitorAnalysis | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CompetitorAnalysis;
  } catch {
    // Legacy/plain-text analysis — wrap it minimally.
    return {
      summary: raw.slice(0, 200),
      pricingPositioning: "unknown",
      threatLevel: "low",
      strengths: [],
      weaknesses: [],
      actions: [],
      blogSuggestion: "",
      warnings: [],
      fullText: raw,
      source: "heuristic",
    };
  }
}

type RawScan = {
  id: string;
  scannedAt: Date;
  services: unknown;
  pricing: unknown;
  blogPosts: unknown;
  techStack: unknown;
  changes: unknown;
  aiAnalysis: string | null;
};

function shapeScan(scan: RawScan): ScanRecord {
  return {
    id: scan.id,
    scannedAt: scan.scannedAt.toISOString(),
    services: (scan.services as string[] | null) ?? [],
    pricing: (scan.pricing as string[] | null) ?? [],
    blogPosts: (scan.blogPosts as BlogPost[] | null) ?? [],
    techStack: (scan.techStack as string[] | null) ?? [],
    changes: (scan.changes as ScanChange[] | null) ?? [],
    analysis: parseAnalysis(scan.aiAnalysis),
  };
}

export async function getCompetitorsWithLatestScan(): Promise<CompetitorListItem[]> {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" },
    include: { scans: { orderBy: { scannedAt: "desc" }, take: 1 } },
  });

  return competitors.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    isActive: c.isActive,
    lastScanned: c.lastScanned?.toISOString() ?? null,
    latestScan: c.scans[0] ? shapeScan(c.scans[0]) : null,
  }));
}

export async function getCompetitorDetail(id: string): Promise<CompetitorDetailData | null> {
  const c = await prisma.competitor.findUnique({
    where: { id },
    include: { scans: { orderBy: { scannedAt: "desc" } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    url: c.url,
    isActive: c.isActive,
    lastScanned: c.lastScanned?.toISOString() ?? null,
    scans: c.scans.map(shapeScan),
  };
}

const THREAT_SCORE: Record<ThreatLevel, number> = { low: 1, medium: 2, high: 3 };

function averageThreat(levels: ThreatLevel[]): ThreatLevel {
  if (!levels.length) return "low";
  const avg = levels.reduce((a, l) => a + THREAT_SCORE[l], 0) / levels.length;
  if (avg >= 2.34) return "high";
  if (avg >= 1.67) return "medium";
  return "low";
}

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const list = await getCompetitorsWithLatestScan();
  const scanned = list.filter((c) => c.latestScan);

  const levels = scanned
    .map((c) => c.latestScan?.analysis?.threatLevel)
    .filter((l): l is ThreatLevel => Boolean(l));

  const changesByCompetitor = scanned
    .filter((c) => (c.latestScan?.changes.length ?? 0) > 0)
    .map((c) => ({ competitor: c.name, changes: c.latestScan!.changes }));

  const totalChanges = changesByCompetitor.reduce((a, c) => a + c.changes.length, 0);

  // Opportunities — dedupe across competitor analyses.
  const seen = new Set<string>();
  const opportunities: string[] = [];
  for (const c of scanned) {
    for (const action of c.latestScan?.analysis?.actions ?? []) {
      const key = action.toLowerCase().slice(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        opportunities.push(action);
      }
      if (opportunities.length >= 3) break;
    }
    if (opportunities.length >= 3) break;
  }

  // Recommended blog — from the highest-threat competitor with a suggestion.
  const sortedByThreat = [...scanned].sort(
    (a, b) =>
      THREAT_SCORE[b.latestScan?.analysis?.threatLevel ?? "low"] -
      THREAT_SCORE[a.latestScan?.analysis?.threatLevel ?? "low"],
  );
  const topSuggestion = sortedByThreat.find((c) => c.latestScan?.analysis?.blogSuggestion)
    ?.latestScan?.analysis?.blogSuggestion;
  const recommendedBlog = {
    title: topSuggestion || BLOG_TOPIC_POOL[0].title,
    reason: topSuggestion
      ? "Pokrýva obsahovú medzeru u najsilnejšieho konkurenta a posilní organický dosah."
      : "Transparentný cenník je téma, ktorú väčšina konkurentov nepokrýva.",
  };

  // Warnings.
  const warnings: string[] = [];
  for (const c of scanned) {
    if (c.latestScan?.analysis?.threatLevel === "high") {
      warnings.push(`${c.name} je vysoká hrozba — sleduj ich aktivitu pozorne.`);
    }
    for (const w of c.latestScan?.analysis?.warnings ?? []) warnings.push(`${c.name}: ${w}`);
  }
  const failed = list.filter((c) => !c.latestScan);
  if (failed.length) {
    warnings.push(`${failed.length} konkurent(ov) zatiaľ nebol naskenovaný — spusti sken.`);
  }

  const changesSummary =
    totalChanges > 0
      ? `Za posledný sken sme zaznamenali ${totalChanges} ${
          totalChanges === 1 ? "zmenu" : totalChanges < 5 ? "zmeny" : "zmien"
        } u ${changesByCompetitor.length} konkurentov.`
      : "Od posledného skenu sme nezaznamenali žiadne výrazné zmeny u konkurencie.";

  return {
    generatedAt: new Date().toISOString(),
    competitorsScanned: scanned.length,
    averageThreat: averageThreat(levels),
    changesSummary,
    changesByCompetitor,
    opportunities: opportunities.length
      ? opportunities
      : [
          "Zdôrazni rýchlosť Next.js webov a nameranú výkonnosť (Core Web Vitals).",
          "Ponúkni transparentný cenník — väčšina konkurentov ho neuvádza.",
          "Posilni lokálne SEO pre Nitriansky kraj a obsahový marketing.",
        ],
    recommendedBlog,
    warnings: warnings.slice(0, 6),
    source: "heuristic",
  };
}
