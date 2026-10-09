import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBucketOverview } from "@/lib/finance/buckets";
import type { BucketOverviewDTO } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const months = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get("months")) || 6));
  const overview = await getBucketOverview(months);
  const dto: BucketOverviewDTO = {
    budgetAccountId: overview.budgetAccount?.id ?? null,
    budgetAccountName: overview.budgetAccount?.name ?? null,
    buckets: overview.buckets,
    unassigned: overview.unassigned,
    safeToSpend: overview.safeToSpend,
  };
  return NextResponse.json(dto);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; percentage?: number; color?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const percentage = Number(body.percentage);
  if (!Number.isFinite(percentage) || percentage < 0) {
    return NextResponse.json({ error: "invalid_percentage" }, { status: 400 });
  }
  const count = await prisma.financeBucket.count();
  const bucket = await prisma.financeBucket.create({
    data: { name, percentage, color: body.color || undefined, sortOrder: count },
  });
  return NextResponse.json({ bucket: { ...bucket, percentage: bucket.percentage.toNumber() } });
}
