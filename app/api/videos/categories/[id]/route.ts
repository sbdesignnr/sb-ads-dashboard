import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { name?: string; color?: string; order?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: { name?: string; color?: string; order?: number } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.order === "number") data.order = body.order;
  try {
    const cat = await prisma.videoCategory.update({ where: { id }, data });
    return NextResponse.json({ category: { id: cat.id, name: cat.name, color: cat.color, order: cat.order } });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.videoCategory.deleteMany({ where: { id } });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
