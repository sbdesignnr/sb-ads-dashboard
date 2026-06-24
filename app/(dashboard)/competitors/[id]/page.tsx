import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompetitorDetail } from "@/lib/competitors/queries";
import { CompetitorDetail } from "./competitor-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getCompetitorDetail(id);
  return { title: data ? data.name : "Konkurent nenájdený" };
}

export default async function CompetitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCompetitorDetail(id);
  if (!data) notFound();

  return <CompetitorDetail data={data} />;
}
