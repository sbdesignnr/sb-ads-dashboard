import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { name?: string; percentage?: number; color?: string; sortOrder?: number; isActive?: boolean; isPayBucket?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const bucket = await prisma.financeBucket.findUnique({ where: { id } });
  if (!bucket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: { name?: string; percentage?: number; color?: string; sortOrder?: number; isActive?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.percentage === "number" && Number.isFinite(body.percentage) && body.percentage >= 0) {
    data.percentage = body.percentage;
  }
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  if (typeof body.isPayBucket === "boolean" && body.isPayBucket) {
    // Presne jedno vrecko je "pay" vrecko naraz (z neho sa počíta "bezpečné na minutie").
    await prisma.$transaction([
      prisma.financeBucket.updateMany({ where: { id: { not: id } }, data: { isPayBucket: false } }),
      prisma.financeBucket.update({ where: { id }, data: { ...data, isPayBucket: true } }),
    ]);
  } else {
    await prisma.financeBucket.update({
      where: { id },
      data: { ...data, ...(body.isPayBucket === false ? { isPayBucket: false } : {}) },
    });
  }

  const updated = await prisma.financeBucket.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ bucket: { ...updated, percentage: updated.percentage.toNumber() } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const count = await prisma.financeCategory.count({ where: { bucketId: id } });
  if (count > 0) {
    return NextResponse.json({ error: "has_categories", count }, { status: 409 });
  }
  await prisma.financeBucket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
