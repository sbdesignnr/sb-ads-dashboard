import { prisma } from "@/lib/prisma";
import type { Lead, LeadSegment } from "@prisma/client";
import { discoverBusinesses, placesConfigured } from "./google-places";
import { analyzeWebsite } from "./website-analyzer";
import { enrichCompany } from "./orsr";
import { generateDossier } from "./ai";

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

/** Run `fn` over `items` with at most `limit` in flight — keeps scans within Vercel's time budget. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Deep-enrich one existing lead: scrape the site (contacts + text), analyze it,
 * verify the company in ORSR (owner + activity), and build the full AI dossier
 * (contacts, pain point, opportunity, best contact time, outreach angle). Persists
 * everything. Returns whether the site qualified and if the company is active.
 */
export async function enrichLead(
  leadId: string,
  segment: Pick<LeadSegment, "id" | "name" | "communicationStyle">,
): Promise<{ qualified: boolean; active: boolean | null } | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.websiteUrl) return null;

  const analysis = await analyzeWebsite(lead.websiteUrl);
  // Prefer an IČO scraped from the site — it gives an exact ORSR match (owner + activity).
  const ico = lead.ico ?? analysis.extractedIco;
  const orsr = await enrichCompany({ ico, name: lead.companyName }).catch(() => null);

  const dossier = process.env.ANTHROPIC_API_KEY
    ? await generateDossier({
        companyName: lead.companyName,
        segmentName: segment.name,
        communicationStyle: segment.communicationStyle,
        websiteUrl: lead.websiteUrl,
        companyCity: lead.companyCity ?? orsr?.city ?? null,
        ico: orsr?.ico ?? ico ?? null,
        companyActive: orsr?.active ?? null,
        orsrStatusNote: orsr?.statusNote ?? null,
        orsrOwnerName: orsr?.ownerName ?? null,
        orsrOwnerPosition: orsr?.ownerPosition ?? null,
        placesPhone: lead.companyPhone,
        extractedEmails: analysis.extractedEmails,
        extractedPhones: analysis.extractedPhones,
        websiteScore: analysis.websiteScore,
        websiteTechnology: analysis.websiteTechnology,
        websiteAge: analysis.websiteAge,
        pageSpeedMobile: analysis.pageSpeedMobile,
        pageSpeedDesktop: analysis.pageSpeedDesktop,
        hasSsl: analysis.hasSsl,
        isMobileFriendly: analysis.isMobileFriendly,
        issues: analysis.issues,
        pageText: analysis.pageText,
      }).catch(() => null)
    : null;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      segmentId: segment.id || undefined,
      websiteScore: analysis.websiteScore,
      websiteTechnology: analysis.websiteTechnology,
      websiteAge: analysis.websiteAge,
      pageSpeedMobile: analysis.pageSpeedMobile,
      pageSpeedDesktop: analysis.pageSpeedDesktop,
      hasSsl: analysis.hasSsl,
      isMobileFriendly: analysis.isMobileFriendly,
      websiteIssues: analysis.issues,
      ico: orsr?.ico ?? ico ?? undefined,
      companyActive: orsr?.active ?? undefined,
      companyAddress: lead.companyAddress ?? orsr?.address ?? undefined,
      companyCity: lead.companyCity ?? orsr?.city ?? undefined,
      // Prefer real contact data the AI pulled from the site, then extractor, then ORSR.
      ownerName: dossier?.ownerName ?? orsr?.ownerName ?? lead.ownerName ?? undefined,
      ownerPosition: dossier?.ownerRole ?? orsr?.ownerPosition ?? lead.ownerPosition ?? undefined,
      companyEmail: dossier?.email ?? analysis.extractedEmails[0] ?? lead.companyEmail ?? undefined,
      companyPhone: dossier?.phone ?? lead.companyPhone ?? analysis.extractedPhones[0] ?? undefined,
      ...(dossier
        ? {
            aiSummary: dossier.summary || null,
            aiPainPoint: dossier.painPoint || null,
            aiOpportunity: dossier.opportunity || null,
            aiOutreachAngle: dossier.outreachAngle || null,
            bestContactTime: dossier.bestContactTime || null,
          }
        : {}),
      lastScannedAt: new Date(),
    },
  });

  return { qualified: analysis.qualified, active: orsr?.active ?? null };
}

/**
 * Scan one segment. Phase 1 discovers many businesses across cities (saved fast so
 * the feed fills up). Phase 2 deep-enriches a bounded batch (never-scanned first)
 * so we stay within the serverless time budget; repeat scans work through the rest.
 */
export async function scanSegment(
  segmentId: string,
  opts: { maxDiscover?: number; enrichBatch?: number } = {},
): Promise<ScanSummary> {
  const maxDiscover = opts.maxDiscover ?? 60;
  const enrichBatch = opts.enrichBatch ?? 12;
  const segment = await prisma.leadSegment.findUnique({ where: { id: segmentId } });
  if (!segment) return { jobId: "", foundTotal: 0, foundQualified: 0, error: "segment_not_found" };

  const job = await prisma.leadScanJob.create({ data: { segmentId, status: "running", startedAt: new Date() } });

  if (!placesConfigured()) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: "GOOGLE_PLACES_API_KEY nie je nastavený.", completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, error: "places_not_configured" };
  }

  try {
    // Phase 1 — broad discovery across cities, saved with basic info right away.
    const keywords = segment.keywords.length ? segment.keywords : [segment.name];
    const discovered = await discoverBusinesses(keywords, { cap: maxDiscover });
    for (const b of discovered) {
      if (!b.website) continue;
      const norm = normalizeWebsite(b.website);
      await prisma.lead.upsert({
        where: { websiteUrl: norm },
        update: { segmentId },
        create: {
          segmentId,
          companyName: b.name,
          websiteUrl: norm,
          companyPhone: b.phone,
          companyAddress: b.address,
          companyCity: b.city,
          status: "new",
          source: "google-places",
        },
      });
    }
    await prisma.leadScanJob.update({ where: { id: job.id }, data: { foundTotal: discovered.length } });

    // Phase 2 — deep-enrich a batch, never-scanned first.
    const toEnrich: Lead[] = await prisma.lead.findMany({
      where: { segmentId, websiteUrl: { not: null } },
      orderBy: [{ lastScannedAt: { sort: "asc", nulls: "first" } }],
      take: enrichBatch,
    });

    let qualified = 0;
    await mapPool(toEnrich, 4, async (lead) => {
      try {
        const r = await enrichLead(lead.id, segment);
        if (r?.qualified) {
          qualified++;
          await prisma.leadScanJob.update({ where: { id: job.id }, data: { foundQualified: qualified } });
        }
      } catch {
        /* skip this lead, keep going */
      }
    });

    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "completed", foundTotal: discovered.length, foundQualified: qualified, completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: discovered.length, foundQualified: qualified };
  } catch (e) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: (e as Error).message.slice(0, 300), completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, error: (e as Error).message };
  }
}

/** Cron helper: scans every segment with a small per-segment enrich cap. */
export async function scanAllSegments(
  opts: { maxDiscover?: number; enrichBatch?: number } = {},
): Promise<{ segments: number; totalQualified: number }> {
  const segments = await prisma.leadSegment.findMany();
  let totalQualified = 0;
  for (const s of segments) {
    const r = await scanSegment(s.id, { maxDiscover: opts.maxDiscover ?? 40, enrichBatch: opts.enrichBatch ?? 5 });
    totalQualified += r.foundQualified;
  }
  return { segments: segments.length, totalQualified };
}
