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

  let body: { status?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
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
      data: { status, ...(status === "todo" ? { doneAt: null, verifyAt: null } : {}) },
    });
  }
  return NextResponse.json({ task: await prisma.seoTask.findUnique({ where: { id } }) });
}
