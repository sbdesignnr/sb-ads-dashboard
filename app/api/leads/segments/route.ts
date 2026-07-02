import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeSegment } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const segments = await prisma.leadSegment.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json({ segments: segments.map(serializeSegment) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; color?: string; icon?: string; keywords?: string[]; communicationStyle?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const seg = await prisma.leadSegment.create({
    data: {
      name,
      color: body.color || "#3b82f6",
      icon: body.icon ?? null,
      keywords,
      communicationStyle: body.communicationStyle?.trim() || null,
    },
  });
  return NextResponse.json({ segment: serializeSegment({ ...seg, _count: { leads: 0 } }) });
}
