export type KeywordCompetition = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competition: KeywordCompetition;
  avgCpc: number; // EUR
}

export type KeywordSource = "google-ads" | "mock";

export interface KeywordIdeasResponse {
  source: KeywordSource;
  cached: boolean;
  stale?: boolean;
  updatedAt: string | null;
  keywords: KeywordIdea[];
  error?: string;
}
