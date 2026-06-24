export type ThreatLevel = "low" | "medium" | "high";
export type PricingTier = "budget" | "mid" | "premium" | "unknown";

export interface BlogPost {
  title: string;
  date?: string;
  url?: string;
}

export interface ScrapedData {
  url: string;
  ok: boolean;
  title: string;
  metaDescription: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  services: string[];
  pricing: string[];
  blogPosts: BlogPost[];
  contact: { emails: string[]; phones: string[] };
  techStack: string[];
  rawContent: string;
  error?: string;
  fetchedAt: string;
}

export interface CompetitorAnalysis {
  summary: string;
  pricingPositioning: PricingTier;
  threatLevel: ThreatLevel;
  strengths: string[];
  weaknesses: string[];
  actions: string[];
  blogSuggestion: string;
  warnings: string[];
  fullText: string;
  source: "claude" | "heuristic";
}

export interface ScanChange {
  type: "service" | "pricing" | "blog" | "tech";
  direction: "added" | "removed" | "changed";
  label: string;
  detail?: string;
}

export interface ScanSummaryResult {
  competitor: string;
  ok: boolean;
  error?: string;
  changes: number;
  threatLevel: ThreatLevel;
}

export interface WeeklyReport {
  generatedAt: string;
  competitorsScanned: number;
  averageThreat: ThreatLevel;
  changesSummary: string;
  changesByCompetitor: { competitor: string; changes: ScanChange[] }[];
  opportunities: string[];
  recommendedBlog: { title: string; reason: string };
  warnings: string[];
  source: "claude" | "heuristic";
}
