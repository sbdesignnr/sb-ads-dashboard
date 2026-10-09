import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { renameCategory } from "@/lib/finance/categories";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { name?: string; bucketId?: string | null; color?: string; isActive?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const category = await prisma.financeCategory.findUnique({ where: { id } });
  if (!category) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== category.name) {
    try {
      await renameCategory(id, body.name);
    } catch {
      return NextResponse.json({ error: "rename_failed" }, { status: 400 });
    }
  }

  const data: { bucketId?: string | null; color?: string; isActive?: boolean } = {};
  if ("bucketId" in body) data.bucketId = body.bucketId || null;
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  const updated = Object.keys(data).length
    ? await prisma.financeCategory.update({ where: { id }, data })
    : await prisma.financeCategory.findUniqueOrThrow({ where: { id } });

  return NextResponse.json({
    category: {
      id: updated.id,
      name: updated.name,
      bucketId: updated.bucketId,
      isIncome: updated.isIncome,
      color: updated.color,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const count = await prisma.financeTransaction.count({ where: { categoryId: id } });
  if (count === 0) {
    await prisma.financeCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.financeCategory.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true, deleted: false, deactivated: true });
}
