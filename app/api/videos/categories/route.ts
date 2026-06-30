import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const categories = await prisma.videoCategory.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { channels: true } } },
  });
  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      order: c.order,
      channelCount: c._count.channels,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; color?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const max = await prisma.videoCategory.aggregate({ _max: { order: true } });
  const cat = await prisma.videoCategory.create({
    data: { name, color: body.color || "#3b82f6", order: (max._max.order ?? 0) + 1 },
  });
  return NextResponse.json({
    category: { id: cat.id, name: cat.name, color: cat.color, order: cat.order, channelCount: 0 },
  });
}
