import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { captureMetrics } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dueOnly = req.nextUrl.searchParams.get("due") === "1";
  try {
    const reminders = await prisma.campaignReminder.findMany({
      where: dueOnly ? { status: "pending", checkResultsBy: { lte: new Date() } } : {},
      orderBy: { checkResultsBy: "asc" },
      take: 100,
    });
    return NextResponse.json({ reminders });
  } catch {
    return NextResponse.json({ reminders: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { insight?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const i = body.insight ?? {};
  const title = typeof i.title === "string" ? i.title : "";
  const solution = typeof i.solution === "string" ? i.solution : "";
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const campaignId = typeof i.campaignId === "string" ? i.campaignId : null;
  const campaignName = typeof i.campaignName === "string" ? i.campaignName : null;
  const priority = typeof i.priority === "string" ? i.priority : null;
  const implementDays = clamp(Number(i.implementByDays ?? 3) || 3, 1, 60);
  const checkDays = clamp(Number(i.checkResultsByDays ?? 14) || 14, 1, 90);

  // Avoid duplicate active reminders for the same recommendation.
  const existing = await prisma.campaignReminder.findFirst({
    where: { status: "pending", insightTitle: title, campaignId },
  });
  if (existing) return NextResponse.json({ reminder: existing, deduped: true });

  const { snapshot } = await captureMetrics(campaignId);
  const now = Date.now();
  const reminder = await prisma.campaignReminder.create({
    data: {
      recommendationText: solution ? `${title}: ${solution}` : title,
      insightTitle: title,
      priority,
      campaignId,
      campaignName,
      implementBy: new Date(now + implementDays * DAY),
      checkResultsBy: new Date(now + checkDays * DAY),
      baselineMetrics: snapshot as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  });
  return NextResponse.json({ reminder });
}
