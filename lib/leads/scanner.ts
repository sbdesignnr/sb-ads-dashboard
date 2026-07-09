import { prisma } from "@/lib/prisma";
import type { Lead, LeadSegment } from "@prisma/client";
import { discoverBusinesses, placesConfigured, CZ_CITIES, type Region } from "./google-places";
import { analyzeWebsite } from "./website-analyzer";
import { enrichCompany } from "./orsr";
import { enrichCompanyAres } from "./ares";
import { generateDossier } from "./ai";
import { findEmailForLead } from "./email-finder";

/** Guess whether a lead is a Czech company (routes ARES vs ORSR enrichment). */
function isCzLead(lead: Pick<Lead, "source" | "companyCity" | "companyAddress">): boolean {
  if (lead.source?.endsWith("-cz")) return true;
  if (lead.companyCity && CZ_CITIES.includes(lead.companyCity)) return true;
  return /(česk|czech|\bpraha\b|\bbrno\b|,\s*CZ\b)/i.test(lead.companyAddress ?? "");
}

export interface ScanSummary {
  jobId: string;
  foundTotal: number; // discovered + analyzed
  foundQualified: number;
  foundRejected: number;
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

  let analysis;
  try {
    analysis = await analyzeWebsite(lead.websiteUrl);
  } catch {
    // Analysis failed (network/timeout) — treat as rejected so it never lingers
    // as an unanalyzed, score-less lead in the list.
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        disqualifyReason: "Analýza webu zlyhala.",
        ...(lead.status === "new" ? { status: "rejected" } : {}),
        lastScannedAt: new Date(),
      },
    });
    return { qualified: false, active: null };
  }

  // The website-analysis fields written for every enriched lead (qualified or not).
  const analysisData = {
    segmentId: segment.id || undefined,
    websiteScore: analysis.websiteScore,
    technicalScore: analysis.technicalScore,
    visualScore: analysis.visualScore,
    websiteTechnology: analysis.websiteTechnology,
    hasModernFramework: analysis.hasModernFramework,
    websiteAge: analysis.websiteAge,
    copyrightYear: analysis.copyrightYear,
    pageSpeedMobile: analysis.pageSpeedMobile,
    pageSpeedDesktop: analysis.pageSpeedDesktop,
    hasSsl: analysis.hasSsl,
    isMobileFriendly: analysis.isMobileFriendly,
    websiteIssues: analysis.issues,
    visualIssues: analysis.visualIssues,
    screenshotUrl: analysis.screenshotUrl ?? undefined,
    aiVisualReason: analysis.aiVisualReason,
  };

  // Disqualified site → record why, drop from the active pipeline (only if we
  // haven't already engaged it), and skip the expensive ORSR + AI dossier work.
  if (!analysis.qualified) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        ...analysisData,
        disqualifyReason: analysis.disqualifyReason,
        ...(lead.status === "new" ? { status: "rejected" } : {}),
        lastScannedAt: new Date(),
      },
    });
    return { qualified: false, active: null };
  }

  // Qualified — enrich fully. Prefer an IČO scraped from the site (exact match).
  // CZ companies → ARES, SK companies → ORSR (both return the same shape).
  const ico = lead.ico ?? analysis.extractedIco;
  const registry = isCzLead(lead)
    ? await enrichCompanyAres({ ico, name: lead.companyName }).catch(() => null)
    : await enrichCompany({ ico, name: lead.companyName }).catch(() => null);

  const dossier = process.env.ANTHROPIC_API_KEY
    ? await generateDossier({
        companyName: lead.companyName,
        segmentName: segment.name,
        communicationStyle: segment.communicationStyle,
        websiteUrl: lead.websiteUrl,
        companyCity: lead.companyCity ?? registry?.city ?? null,
        ico: registry?.ico ?? ico ?? null,
        companyActive: registry?.active ?? null,
        orsrStatusNote: registry?.statusNote ?? null,
        orsrOwnerName: registry?.ownerName ?? null,
        orsrOwnerPosition: registry?.ownerPosition ?? null,
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
      ...analysisData,
      disqualifyReason: null, // clear any stale reason from a previous scan
      ico: registry?.ico ?? ico ?? undefined,
      companyActive: registry?.active ?? undefined,
      companyAddress: lead.companyAddress ?? registry?.address ?? undefined,
      companyCity: lead.companyCity ?? registry?.city ?? undefined,
      // Prefer real contact data the AI pulled from the site, then extractor, then ORSR.
      ownerName: dossier?.ownerName ?? registry?.ownerName ?? lead.ownerName ?? undefined,
      ownerPosition: dossier?.ownerRole ?? registry?.ownerPosition ?? lead.ownerPosition ?? undefined,
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

  // Still no contact e-mail? Try the dedicated finder (site scrape + Jina).
  const emailNow = dossier?.email ?? analysis.extractedEmails[0] ?? lead.companyEmail ?? null;
  if (!emailNow) {
    const found = await findEmailForLead(lead.websiteUrl, lead.companyName).catch(() => null);
    if (found) await prisma.lead.update({ where: { id: leadId }, data: { companyEmail: found } });
  }

  return { qualified: true, active: registry?.active ?? null };
}

/**
 * Scan one segment. Phase 1 discovers many businesses across cities (saved fast so
 * the feed fills up). Phase 2 deep-enriches a bounded batch (never-scanned first)
 * so we stay within the serverless time budget; repeat scans work through the rest.
 */
export async function scanSegment(
  segmentId: string,
  opts: { maxDiscover?: number; region?: Region | "both" } = {},
): Promise<ScanSummary> {
  // Every discovered business is fully analyzed in this run, so the cap is bound
  // by the serverless time budget (screenshots + AI per candidate site).
  const maxDiscover = opts.maxDiscover ?? 24;
  const region = opts.region ?? "both";
  const segment = await prisma.leadSegment.findUnique({ where: { id: segmentId } });
  if (!segment) return { jobId: "", foundTotal: 0, foundQualified: 0, foundRejected: 0, error: "segment_not_found" };

  const job = await prisma.leadScanJob.create({ data: { segmentId, status: "running", startedAt: new Date() } });

  if (!placesConfigured()) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: "GOOGLE_PLACES_API_KEY nie je nastavený.", completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, foundRejected: 0, error: "places_not_configured" };
  }

  try {
    // Discover businesses, upsert each and collect its lead id — EVERY one is
    // analyzed below, so nothing is left in the list as an unanalyzed lead.
    const keywords = segment.keywords.length ? segment.keywords : [segment.name];
    const discovered = await discoverBusinesses(keywords, { cap: maxDiscover, region });
    const leadIds: string[] = [];
    for (const b of discovered) {
      if (!b.website) continue;
      const norm = normalizeWebsite(b.website);
      const source = b.country === "CZ" ? "google-places-cz" : "google-places-sk";
      const lead = await prisma.lead.upsert({
        where: { websiteUrl: norm },
        update: { segmentId, source },
        create: {
          segmentId,
          companyName: b.name,
          websiteUrl: norm,
          companyPhone: b.phone,
          companyAddress: b.address,
          companyCity: b.city,
          status: "new",
          source,
        },
      });
      leadIds.push(lead.id);
    }
    await prisma.leadScanJob.update({ where: { id: job.id }, data: { foundTotal: leadIds.length } });

    // Analyze every discovered lead now (technical + visual → qualify or reject).
    // Counts are written live so the UI progress bar updates in real time.
    let qualified = 0;
    let rejected = 0;
    await mapPool(leadIds, 4, async (leadId) => {
      const r = await enrichLead(leadId, segment).catch(() => ({ qualified: false, active: null }));
      if (r?.qualified) qualified++;
      else rejected++;
      await prisma.leadScanJob.update({
        where: { id: job.id },
        data: { foundQualified: qualified, foundRejected: rejected },
      });
    });

    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        foundTotal: leadIds.length,
        foundQualified: qualified,
        foundRejected: rejected,
        completedAt: new Date(),
      },
    });
    return { jobId: job.id, foundTotal: leadIds.length, foundQualified: qualified, foundRejected: rejected };
  } catch (e) {
    await prisma.leadScanJob.update({
      where: { id: job.id },
      data: { status: "failed", errorMessage: (e as Error).message.slice(0, 300), completedAt: new Date() },
    });
    return { jobId: job.id, foundTotal: 0, foundQualified: 0, foundRejected: 0, error: (e as Error).message };
  }
}

/**
 * Scan one segment across all discovery sources (Google Places SK+CZ, deduped by
 * domain) for the chosen region. ARES/ORSR enrichment is picked per lead by
 * country. Thin wrapper over scanSegment kept as the named entry point.
 */
export async function scanAllSources(
  segmentId: string,
  region: Region | "both" = "both",
  opts: { maxDiscover?: number } = {},
): Promise<ScanSummary> {
  return scanSegment(segmentId, { ...opts, region });
}

/**
 * Daily maintenance scan: keeps the pipeline topped up to `targetNew` fresh
 * ("new") leads. Skips entirely when we already have enough. Otherwise scans a
 * rotating window of segments (so all get covered over ~days and each cron run
 * stays within the serverless budget).
 */
export async function scanDaily(
  opts: { targetNew?: number; segmentsPerRun?: number } = {},
): Promise<{ scanned: number; addedQualified: number; newLeads: number; skipped: boolean }> {
  const target = opts.targetNew ?? 200;
  // Each run fully analyzes every discovered site, so keep the daily footprint
  // small enough to finish within the cron time budget.
  const perRun = opts.segmentsPerRun ?? 2;

  const before = await prisma.lead.count({ where: { status: "new" } });
  if (before >= target) {
    return { scanned: 0, addedQualified: 0, newLeads: before, skipped: true };
  }

  const segments = await prisma.leadSegment.findMany({ orderBy: { createdAt: "asc" } });
  if (!segments.length) return { scanned: 0, addedQualified: 0, newLeads: before, skipped: false };

  // Rotate which segments we scan each day so coverage spreads across all of them.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const offset = ((dayIndex * perRun) % segments.length + segments.length) % segments.length;
  const todays = Array.from(
    { length: Math.min(perRun, segments.length) },
    (_, i) => segments[(offset + i) % segments.length],
  );

  let addedQualified = 0;
  for (const s of todays) {
    const r = await scanSegment(s.id, { maxDiscover: 12, region: "both" });
    addedQualified += r.foundQualified;
  }
  const newLeads = await prisma.lead.count({ where: { status: "new" } });
  return { scanned: todays.length, addedQualified, newLeads, skipped: false };
}

/** Utility: scan every segment (heavy — analyzes all discovered sites). */
export async function scanAllSegments(
  opts: { maxDiscover?: number; region?: Region | "both" } = {},
): Promise<{ segments: number; totalQualified: number }> {
  const segments = await prisma.leadSegment.findMany();
  let totalQualified = 0;
  for (const s of segments) {
    const r = await scanSegment(s.id, {
      maxDiscover: opts.maxDiscover ?? 12,
      region: opts.region ?? "both",
    });
    totalQualified += r.foundQualified;
  }
  return { segments: segments.length, totalQualified };
}
