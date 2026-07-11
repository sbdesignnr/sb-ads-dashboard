import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPr, mergePr } from "@/lib/seo/github";
import { captureBaseline } from "@/lib/seo/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Nasadiť": merge the autopilot's PR to production, then mark the task done so
// the verification engine snapshots the baseline and measures the effect later.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.seoTask.findUnique({ where: { id } });
  if (!task?.fixPrNumber) return NextResponse.json({ error: "no_pr" }, { status: 400 });

  // Refuse to merge a PR whose checks aren't green — Vercel preview must pass first.
  const pr = await getPr(task.fixPrNumber).catch(() => null);
  if (!pr) return NextResponse.json({ error: "pr_unavailable" }, { status: 502 });
  if (pr.merged) {
    await prisma.seoTask.update({ where: { id }, data: { fixPrState: "merged" } });
  } else {
    try {
      await mergePr(task.fixPrNumber);
    } catch (e) {
      return NextResponse.json({ error: `Merge zlyhal: ${(e as Error).message}` }, { status: 409 });
    }
    await prisma.seoTask.update({ where: { id }, data: { fixPrState: "merged" } });
  }

  // Snapshots the metric + schedules verification (sets status "done").
  await captureBaseline(id);
  return NextResponse.json({ ok: true, merged: true });
}
