export type LeadStatus = "new" | "contacted" | "responded" | "rejected" | "converted";

export interface SegmentDTO {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  communicationStyle: string | null;
  leadCount: number;
}

export interface LeadDTO {
  id: string;
  segmentId: string | null;
  companyName: string;
  ico: string | null;
  websiteUrl: string | null;
  websiteScore: number | null; // total 0-100 (higher = more outdated)
  technicalScore: number | null; // 0-40
  visualScore: number | null; // 0-60
  websiteAge: number | null;
  copyrightYear: number | null;
  websiteTechnology: string | null;
  hasModernFramework: boolean | null;
  pageSpeedMobile: number | null;
  pageSpeedDesktop: number | null;
  hasSsl: boolean | null;
  isMobileFriendly: boolean | null;
  websiteIssues: string[];
  visualIssues: string[];
  screenshotUrl: string | null;
  aiVisualReason: string | null;
  disqualifyReason: string | null;
  aiSummary: string | null;
  aiPainPoint: string | null;
  aiOpportunity: string | null;
  aiOutreachAngle: string | null;
  bestContactTime: string | null;
  companyActive: boolean | null;
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

export type EmailType = "initial" | "followup1" | "followup2";
export type EmailStatus = "draft" | "approved" | "sent" | "failed" | "rejected";

export interface LeadEmailDTO {
  id: string;
  leadId: string;
  companyName: string;
  companyEmail: string | null;
  companyCity: string | null;
  segmentName: string | null;
  websiteUrl: string | null;
  subject: string;
  body: string;
  emailType: EmailType;
  status: EmailStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface CampaignDTO {
  id: string;
  name: string;
  segmentId: string | null;
  dailyLimit: number;
  sendTime: string;
  isActive: boolean;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  startedAt: string | null;
  createdAt: string;
}

export const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  initial: "Prvý email",
  followup1: "Followup 1",
  followup2: "Followup 2",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nový",
  contacted: "Kontaktovaný",
  responded: "Reagoval",
  rejected: "Odmietnutý",
  converted: "Konvertovaný",
};
