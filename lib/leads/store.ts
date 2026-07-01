import type { Lead, LeadSegment } from "@prisma/client";
import type { LeadDTO, LeadStatus, SegmentDTO } from "./types";

export function serializeLead(l: Lead): LeadDTO {
  return {
    id: l.id,
    segmentId: l.segmentId,
    companyName: l.companyName,
    ico: l.ico,
    websiteUrl: l.websiteUrl,
    websiteScore: l.websiteScore,
    websiteAge: l.websiteAge,
    websiteTechnology: l.websiteTechnology,
    pageSpeedMobile: l.pageSpeedMobile,
    pageSpeedDesktop: l.pageSpeedDesktop,
    hasSsl: l.hasSsl,
    isMobileFriendly: l.isMobileFriendly,
    ownerName: l.ownerName,
    ownerPosition: l.ownerPosition,
    companyEmail: l.companyEmail,
    companyPhone: l.companyPhone,
    companyAddress: l.companyAddress,
    companyCity: l.companyCity,
    status: (["new", "contacted", "rejected", "converted"].includes(l.status) ? l.status : "new") as LeadStatus,
    notes: l.notes,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    lastScannedAt: l.lastScannedAt ? l.lastScannedAt.toISOString() : null,
  };
}

export function serializeSegment(s: LeadSegment & { _count?: { leads: number } }): SegmentDTO {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    keywords: s.keywords,
    leadCount: s._count?.leads ?? 0,
  };
}
