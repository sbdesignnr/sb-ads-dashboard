import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { captureBaseline } from "@/lib/seo/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["todo", "doing", "done", "dismissed"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { status?: string; toggleStep?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Toggle a single checklist step. Checking the first one auto-starts the task
  // so the user never has to press "Začať" separately.
  if (typeof body.toggleStep === "number") {
    const task = await prisma.seoTask.findUnique({ where: { id }, select: { doneSteps: true, status: true } });
    if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const set = new Set(task.doneSteps);
    set.has(body.toggleStep) ? set.delete(body.toggleStep) : set.add(body.toggleStep);
    const doneSteps = [...set].sort((a, b) => a - b);
    const status = task.status === "todo" && doneSteps.length > 0 ? "doing" : task.status;
    const updated = await prisma.seoTask.update({ where: { id }, data: { doneSteps, status } });
    return NextResponse.json({ task: updated });
  }

  const status = body.status;
  if (!status || !ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // Completing a task snapshots its metric and schedules the verification.
  if (status === "done") {
    await captureBaseline(id);
  } else {
    await prisma.seoTask.update({
      where: { id },
      // Re-opening a task clears its checklist so the next attempt starts fresh.
      data: { status, ...(status === "todo" ? { doneAt: null, verifyAt: null, doneSteps: [] } : {}) },
    });
  }
  return NextResponse.json({ task: await prisma.seoTask.findUnique({ where: { id } }) });
}
