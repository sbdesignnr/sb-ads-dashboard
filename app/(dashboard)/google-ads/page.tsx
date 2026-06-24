import type { Metadata } from "next";
import { GoogleAdsView } from "@/components/google-ads/GoogleAdsView";

export const metadata: Metadata = {
  title: "Google Ads",
};

export default function GoogleAdsPage() {
  return <GoogleAdsView />;
}
