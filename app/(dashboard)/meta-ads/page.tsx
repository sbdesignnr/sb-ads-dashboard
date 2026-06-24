import type { Metadata } from "next";
import { PlatformDashboard } from "@/components/charts/PlatformDashboard";

export const metadata: Metadata = {
  title: "Meta Ads",
};

export default function MetaAdsPage() {
  return <PlatformDashboard platform="meta" />;
}
