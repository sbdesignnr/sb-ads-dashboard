import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  captureMetrics,
  computeDeltas,
  generateNextStep,
  type MetricSnapshot,
} from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const reminder = await prisma.campaignReminder.findUnique({ where: { id } });
  if (!reminder) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const baseline = (reminder.baselineMetrics as unknown as MetricSnapshot | null) ?? null;
  const { snapshot: current } = await captureMetrics(reminder.campaignId);
  const { deltas, verdict } = computeDeltas(baseline, current);

  let aiNext = "";
  try {
    aiNext = await generateNextStep(
      reminder.recommendationText,
      reminder.campaignName,
      baseline,
      current,
      verdict,
    );
  } catch (e) {
    aiNext = `AI vyhodnotenie zlyhalo: ${(e as Error).message}`;
  }

  // Mark as reviewed.
  await prisma.campaignReminder.update({ where: { id }, data: { status: "checked" } }).catch(() => {});

  return NextResponse.json({
    reminder: {
      id: reminder.id,
      insightTitle: reminder.insightTitle,
      recommendationText: reminder.recommendationText,
      campaignName: reminder.campaignName,
      createdAt: reminder.createdAt.toISOString(),
    },
    baseline,
    current,
    deltas,
    verdict,
    aiNext,
  });
}
