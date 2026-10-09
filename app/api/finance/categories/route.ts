import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { FinanceCategoryDTO } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

function serialize(c: {
  id: string;
  name: string;
  bucketId: string | null;
  isIncome: boolean;
  color: string;
  sortOrder: number;
  isActive: boolean;
}): FinanceCategoryDTO {
  return {
    id: c.id,
    name: c.name,
    bucketId: c.bucketId,
    isIncome: c.isIncome,
    color: c.color,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const categories = await prisma.financeCategory.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ categories: categories.map(serialize) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; bucketId?: string | null; isIncome?: boolean; color?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const count = await prisma.financeCategory.count();
  const category = await prisma.financeCategory.create({
    data: {
      name,
      bucketId: body.bucketId || null,
      isIncome: Boolean(body.isIncome),
      color: body.color || undefined,
      sortOrder: count,
    },
  });
  return NextResponse.json({ category: serialize(category) });
}
