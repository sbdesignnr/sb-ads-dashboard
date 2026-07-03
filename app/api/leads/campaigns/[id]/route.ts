import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeCampaign } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { name?: string; segmentId?: string | null; dailyLimit?: number; sendTime?: string; isActive?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("segmentId" in body) data.segmentId = body.segmentId && body.segmentId !== "all" ? body.segmentId : null;
  if (typeof body.dailyLimit === "number") data.dailyLimit = Math.min(Math.max(1, Math.floor(body.dailyLimit)), 50);
  if (typeof body.sendTime === "string" && /^\d{2}:\d{2}$/.test(body.sendTime)) data.sendTime = body.sendTime;
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
    if (body.isActive) {
      const existing = await prisma.leadCampaign.findUnique({ where: { id }, select: { startedAt: true } });
      if (existing && !existing.startedAt) data.startedAt = new Date();
    }
  }

  try {
    const campaign = await prisma.leadCampaign.update({ where: { id }, data });
    return NextResponse.json({ campaign: serializeCampaign(campaign) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.leadCampaign.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
