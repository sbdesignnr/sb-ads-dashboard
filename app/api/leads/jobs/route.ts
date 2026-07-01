import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jobs = await prisma.leadScanJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { segment: { select: { name: true } } },
  });
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      segmentName: j.segment?.name ?? "—",
      status: j.status,
      foundTotal: j.foundTotal,
      foundQualified: j.foundQualified,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
