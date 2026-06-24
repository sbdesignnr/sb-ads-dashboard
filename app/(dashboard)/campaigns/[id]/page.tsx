import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignById } from "@/lib/mock-data";
import { CampaignDetail } from "./campaign-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const campaign = getCampaignById(id);
  return { title: campaign ? campaign.name : "Kampaň nenájdená" };
}

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = getCampaignById(id);
  if (!campaign) notFound();

  return <CampaignDetail campaign={campaign} />;
}
