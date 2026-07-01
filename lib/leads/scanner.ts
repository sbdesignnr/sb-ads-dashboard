import { prisma } from "@/lib/prisma";
import { searchBusinesses, placesConfigured, type PlaceBusiness } from "./google-places";
import { analyzeWebsite } from "./website-analyzer";
import { enrichCompany } from "./orsr";

export interface ScanSummary {
  jobId: string;
  foundTotal: number;
  foundQualified: number;
  error?: string;
}

function normalizeWebsite(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

/**
 * Scans one segment: discover businesses via Google Places, analyze each site,
 * and for qualified (outdated, score >= 40) ones enrich via ORSR and upsert into
 * `leads`. The scan job is updated progressively so the UI can poll it.
 */
export async function scanSegment(segmentId: string, opts: { maxBusinesses?: number } = {}): Promise<ScanSummary> {
  const maxBusinesses = opts.maxBusinesses ?? 20;
  const segment = await prisma.leadSegment.findUnique({ where: { id: segmentId } });
  if (!segment) return { jobId: "", foundTotal: 0, foundQualified: 0, error: "segment_not_found" };

  const job = await prisma.leadScanJob.create({
    data: { segmentId, status: "running", startedAt: new Date() },
  });

  if (!placesConfigured()) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "GOOGLE_PLACES_API_KEY nie je nastavený.",
        completedAt: new Date(),
      },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, error: "places_not_configured" };
  }

  try {
    // 1. Discover businesses across the segment's keywords (deduped by website).
    const keywords = segment.keywords.length ? segment.keywords : [segment.name];
    const seen = new Set<string>();
    const businesses: PlaceBusiness[] = [];
    for (const kw of keywords) {
      if (businesses.length >= maxBusinesses) break;
      const found = await searchBusinesses(`${kw} Slovensko`, { maxPages: 1 });
      for (const b of found) {
        if (!b.website) continue;
        const norm = normalizeWebsite(b.website);
        if (seen.has(norm)) continue;
        seen.add(norm);
        businesses.push({ ...b, website: norm });
        if (businesses.length >= maxBusinesses) break;
      }
    }
    await prisma.leadScanJob.update({ where: { id: job.id }, data: { foundTotal: businesses.length } });

    // 2. Analyze + persist qualified leads.
    let qualified = 0;
    for (const b of businesses) {
      if (!b.website) continue;
      try {
        const analysis = await analyzeWebsite(b.website);
        if (!analysis.qualified) continue;

        const orsr = await enrichCompany({ name: b.name }).catch(() => null);
        const now = new Date();
        const scan = {
          websiteScore: analysis.websiteScore,
          websiteTechnology: analysis.websiteTechnology,
          websiteAge: analysis.websiteAge,
          pageSpeedMobile: analysis.pageSpeedMobile,
          pageSpeedDesktop: analysis.pageSpeedDesktop,
          hasSsl: analysis.hasSsl,
          isMobileFriendly: analysis.isMobileFriendly,
        };

        await prisma.lead.upsert({
          where: { websiteUrl: b.website },
          update: {
            segmentId,
            ...scan,
            companyPhone: b.phone ?? undefined,
            companyAddress: b.address ?? orsr?.address ?? undefined,
            companyCity: b.city ?? orsr?.city ?? undefined,
            ico: orsr?.ico ?? undefined,
            ownerName: orsr?.ownerName ?? undefined,
            ownerPosition: orsr?.ownerPosition ?? undefined,
            lastScannedAt: now,
          },
          create: {
            segmentId,
            companyName: b.name,
            websiteUrl: b.website,
            ...scan,
            companyPhone: b.phone,
            companyAddress: b.address ?? orsr?.address ?? null,
            companyCity: b.city ?? orsr?.city ?? null,
            ico: orsr?.ico ?? null,
            ownerName: orsr?.ownerName ?? null,
            ownerPosition: orsr?.ownerPosition ?? null,
            status: "new",
            source: "google-places",
            lastScannedAt: now,
          },
        });
        qualified++;
        await prisma.leadScanJob.update({ where: { id: job.id }, data: { foundQualified: qualified } });
      } catch {
        /* skip this business, keep scanning */
      }
    }

    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "completed", foundTotal: businesses.length, foundQualified: qualified, completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: businesses.length, foundQualified: qualified };
  } catch (e) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: (e as Error).message.slice(0, 300), completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, error: (e as Error).message };
  }
}

/** Cron helper: scans every segment with a small per-segment cap. */
export async function scanAllSegments(opts: { maxBusinesses?: number } = {}): Promise<{ segments: number; totalQualified: number }> {
  const segments = await prisma.leadSegment.findMany();
  let totalQualified = 0;
  for (const s of segments) {
    const r = await scanSegment(s.id, { maxBusinesses: opts.maxBusinesses ?? 6 });
    totalQualified += r.foundQualified;
  }
  return { segments: segments.length, totalQualified };
}
