import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeSegment } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { name?: string; color?: string; icon?: string; keywords?: string[]; communicationStyle?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: { name?: string; color?: string; icon?: string; keywords?: string[]; communicationStyle?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.icon === "string") data.icon = body.icon;
  if (Array.isArray(body.keywords)) data.keywords = body.keywords.map((k) => String(k).trim()).filter(Boolean);
  if (typeof body.communicationStyle === "string") data.communicationStyle = body.communicationStyle.trim() || null;
  try {
    const seg = await prisma.leadSegment.update({
      where: { id },
      data,
      include: { _count: { select: { leads: true } } },
    });
    return NextResponse.json({ segment: serializeSegment(seg) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.leadSegment.deleteMany({ where: { id } });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
