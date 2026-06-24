"use client";

import { googleCampaigns as mockGoogleCampaigns } from "@/lib/mock-data";
import { useCachedResource } from "@/lib/client-cache";
import type { Campaign } from "@/lib/types";
import type { DataSource } from "@/lib/google-ads/types";

interface Payload {
  campaigns: Campaign[];
  source: DataSource;
}

/**
 * Google Ads campaigns with a shared client cache: the first visit fetches,
 * later navigations render instantly from cache and revalidate in the
 * background. Falls back to deterministic mock data (no hydration mismatch).
 */
export function useGoogleAdsCampaigns(): {
  campaigns: Campaign[];
  source: DataSource;
  loading: boolean;
} {
  const { data, loading } = useCachedResource<Payload>(
    "google-ads:campaigns",
    async () => {
      const res = await fetch("/api/google-ads/campaigns");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { campaigns?: Campaign[]; source?: DataSource };
      const hasReal = Array.isArray(json.campaigns) && json.campaigns.length > 0;
      return {
        campaigns: hasReal ? (json.campaigns as Campaign[]) : mockGoogleCampaigns,
        source: hasReal && json.source === "google-ads" ? "google-ads" : "mock",
      };
    },
    { initialData: { campaigns: mockGoogleCampaigns, source: "mock" } },
  );

  return {
    campaigns: data?.campaigns ?? mockGoogleCampaigns,
    source: data?.source ?? "mock",
    loading,
  };
}
