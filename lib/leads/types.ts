export type LeadStatus = "new" | "contacted" | "rejected" | "converted";

export interface SegmentDTO {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  leadCount: number;
}

export interface LeadDTO {
  id: string;
  segmentId: string | null;
  companyName: string;
  ico: string | null;
  websiteUrl: string | null;
  websiteScore: number | null;
  websiteAge: number | null;
  websiteTechnology: string | null;
  pageSpeedMobile: number | null;
  pageSpeedDesktop: number | null;
  hasSsl: boolean | null;
  isMobileFriendly: boolean | null;
  websiteIssues: string[];
  aiSummary: string | null;
  aiPainPoint: string | null;
  aiOpportunity: string | null;
  ownerName: string | null;
  ownerPosition: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  status: LeadStatus;
  notes: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  lastScannedAt: string | null;
}

export interface ScanJobDTO {
  id: string;
  segmentId: string | null;
  status: string;
  foundTotal: number;
  foundQualified: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nový",
  contacted: "Kontaktovaný",
  rejected: "Odmietnutý",
  converted: "Konvertovaný",
};
