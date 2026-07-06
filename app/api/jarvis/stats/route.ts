import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [leadsToday, emailsSent, projectsCount] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.leadEmail.count({ where: { status: "sent" } }),
    prisma.lead.count({ where: { status: "converted" } }),
  ]);

  return NextResponse.json({
    leadsToday,
    emailsSent,
    googleAdsSpend: null, // filled in once a finance/ads spend source is wired
    projectsCount,
  });
}
