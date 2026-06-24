"use client";

import { PlatformDashboard } from "@/components/charts/PlatformDashboard";
import { useGoogleAdsCampaigns } from "@/lib/hooks/useGoogleAdsCampaigns";

export function GoogleAdsView() {
  const { campaigns, source, loading } = useGoogleAdsCampaigns();
  return (
    <PlatformDashboard platform="google" campaigns={campaigns} source={source} loading={loading} />
  );
}
