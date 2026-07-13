import type { Lead, LeadSegment, LeadEmail, LeadCampaign } from "@prisma/client";
import type { CampaignDTO, EmailStatus, EmailType, LeadDTO, LeadEmailDTO, LeadStatus, SegmentDTO } from "./types";

export function serializeLead(l: Lead): LeadDTO {
  return {
    id: l.id,
    segmentId: l.segmentId,
    companyName: l.companyName,
    ico: l.ico,
    websiteUrl: l.websiteUrl,
    websiteScore: l.websiteScore,
    technicalScore: l.technicalScore,
    visualScore: l.visualScore,
    websiteAge: l.websiteAge,
    copyrightYear: l.copyrightYear,
    websiteTechnology: l.websiteTechnology,
    hasModernFramework: l.hasModernFramework,
    pageSpeedMobile: l.pageSpeedMobile,
    pageSpeedDesktop: l.pageSpeedDesktop,
    hasSsl: l.hasSsl,
    isMobileFriendly: l.isMobileFriendly,
    websiteIssues: l.websiteIssues ?? [],
    visualIssues: l.visualIssues ?? [],
    aiVisualReason: l.aiVisualReason,
    disqualifyReason: l.disqualifyReason,
    aiSummary: l.aiSummary,
    aiPainPoint: l.aiPainPoint,
    aiOpportunity: l.aiOpportunity,
    aiOutreachAngle: l.aiOutreachAngle,
    bestContactTime: l.bestContactTime,
    companyActive: l.companyActive,
    ownerName: l.ownerName,
    ownerPosition: l.ownerPosition,
    companyEmail: l.companyEmail,
    companyPhone: l.companyPhone,
    companyAddress: l.companyAddress,
    companyCity: l.companyCity,
    status: (["new", "contacted", "responded", "rejected", "converted"].includes(l.status) ? l.status : "new") as LeadStatus,
    notes: l.notes,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    lastScannedAt: l.lastScannedAt ? l.lastScannedAt.toISOString() : null,
  };
}

type LeadLite = Pick<Lead, "companyName" | "companyEmail" | "companyCity" | "websiteUrl" | "segmentId"> & {
  segment?: { name: string } | null;
};

export function serializeLeadEmail(e: LeadEmail & { lead?: LeadLite | null }): LeadEmailDTO {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: e.id,
    leadId: e.leadId,
    companyName: e.lead?.companyName ?? "—",
    companyEmail: e.lead?.companyEmail ?? null,
    companyCity: e.lead?.companyCity ?? null,
    segmentId: e.lead?.segmentId ?? null,
    segmentName: e.lead?.segment?.name ?? null,
    websiteUrl: e.lead?.websiteUrl ?? null,
    subject: e.subject,
    body: e.body,
    emailType: e.emailType as EmailType,
    status: e.status as EmailStatus,
    scheduledAt: iso(e.scheduledAt),
    sentAt: iso(e.sentAt),
    openedAt: iso(e.openedAt),
    lastOpenedAt: iso(e.lastOpenedAt),
    openCount: e.openCount,
    clickedAt: iso(e.clickedAt),
    lastClickedAt: iso(e.lastClickedAt),
    clickCount: e.clickCount,
    repliedAt: iso(e.repliedAt),
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeCampaign(c: LeadCampaign): CampaignDTO {
  return {
    id: c.id,
    name: c.name,
    segmentId: c.segmentId,
    dailyLimit: c.dailyLimit,
    sendTime: c.sendTime,
    isActive: c.isActive,
    totalSent: c.totalSent,
    totalOpened: c.totalOpened,
    totalReplied: c.totalReplied,
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeSegment(s: LeadSegment & { _count?: { leads: number } }): SegmentDTO {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    keywords: s.keywords,
    communicationStyle: s.communicationStyle,
    leadCount: s._count?.leads ?? 0,
    scanOffset: s.scanOffset,
    lastScanRegions: s.lastScanRegions,
  };
}
