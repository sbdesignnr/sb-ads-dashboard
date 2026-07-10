import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPrimarySite } from "@/lib/seo/audit";
import { gscStatus } from "@/lib/seo/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const site = await getPrimarySite();
  const [latestAudit, tasks, gsc] = await Promise.all([
    prisma.seoAudit.findFirst({ where: { siteId: site.id }, orderBy: { startedAt: "desc" } }),
    prisma.seoTask.findMany({
      where: { siteId: site.id, status: { not: "dismissed" } },
      orderBy: [{ status: "asc" }, { priority: "desc" }],
    }),
    gscStatus(),
  ]);

  return NextResponse.json({
    site: { domain: site.domain, url: site.url, gscProperty: site.gscProperty },
    audit: latestAudit,
    tasks,
    gsc,
  });
}
