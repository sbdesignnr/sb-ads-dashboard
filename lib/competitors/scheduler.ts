import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scrapeBlogPosts, scrapeWebsite } from "./scraper";
import { analyzeCompetitor, detectChanges } from "./analyzer";
import type { ScanSummaryResult } from "./types";

const toJson = <T>(v: T): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/**
 * Scrape + analyze all active competitors (or a single one) and persist a scan.
 * A failure on one competitor never stops the rest.
 */
export async function runCompetitorScan(
  competitorId?: string,
): Promise<{ scanned: number; results: ScanSummaryResult[] }> {
  const competitors = competitorId
    ? await prisma.competitor.findMany({ where: { id: competitorId } })
    : await prisma.competitor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  const results: ScanSummaryResult[] = [];

  for (const c of competitors) {
    try {
      const scraped = await scrapeWebsite(c.url);
      scraped.blogPosts = await scrapeBlogPosts(c.url);

      const prev = await prisma.competitorScan.findFirst({
        where: { competitorId: c.id },
        orderBy: { scannedAt: "desc" },
      });
      const prevData = prev
        ? {
            services: (prev.services as string[] | null) ?? [],
            pricing: (prev.pricing as string[] | null) ?? [],
            blogPosts: (prev.blogPosts as { title: string }[] | null) ?? [],
            techStack: (prev.techStack as string[] | null) ?? [],
          }
        : null;

      const changes = detectChanges(scraped, prevData);
      const analysis = await analyzeCompetitor(scraped);

      await prisma.competitorScan.create({
        data: {
          competitorId: c.id,
          services: toJson(scraped.services),
          pricing: toJson(scraped.pricing),
          blogPosts: toJson(scraped.blogPosts),
          techStack: toJson(scraped.techStack),
          aiAnalysis: JSON.stringify(analysis),
          changes: toJson(changes),
          rawContent: scraped.rawContent,
        },
      });

      await prisma.competitor.update({
        where: { id: c.id },
        data: { lastScanned: new Date() },
      });

      results.push({
        competitor: c.name,
        ok: scraped.ok,
        error: scraped.error,
        changes: changes.length,
        threatLevel: analysis.threatLevel,
      });
    } catch (err) {
      console.error(`[competitors] scan failed for ${c.name}:`, (err as Error).message);
      results.push({
        competitor: c.name,
        ok: false,
        error: (err as Error).message,
        changes: 0,
        threatLevel: "low",
      });
    }
  }

  return { scanned: results.length, results };
}
