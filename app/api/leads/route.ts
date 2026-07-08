import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

// Lead-gen rebuild (new 0-100 scoring, qualify >= 65) went live on 2026-07-08.
// Leads created before it are "legacy" and grandfathered in so the existing
// pipeline isn't lost.
const IMPL_DATE = new Date("2026-07-08T00:00:00.000Z");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const segment = sp.get("segment"); // segmentId | "all" | "none"
  const status = sp.get("status") ?? "all"; // status | "all"

  // Segment scope only — used both for the list and for the "of Y" total count.
  const segmentWhere: Prisma.LeadWhereInput = {};
  if (segment && segment !== "all") segmentWhere.segmentId = segment === "none" ? null : segment;

  // Show newly qualified leads (score >= 65) OR any legacy lead created before
  // the rebuild — the whole old pipeline is kept regardless of its score; the
  // strict 65 bar applies only to leads scanned under the new system.
  const qualifiedOr: Prisma.LeadWhereInput[] = [
    { websiteScore: { gte: 65 } },
    { createdAt: { lt: IMPL_DATE } },
  ];

  const where: Prisma.LeadWhereInput = { ...segmentWhere };
  if (status === "contacted" || status === "converted" || status === "responded" || status === "rejected") {
    // Curated / engaged tabs (and the rejected tab): show every lead with that
    // status regardless of score — you never want a worked lead to vanish.
    where.status = status;
  } else if (status === "new") {
    where.status = "new";
    where.OR = qualifiedOr;
  } else {
    // "all": hide rejected + noise, but keep qualified, legacy and engaged leads.
    where.status = { not: "rejected" };
    where.OR = [...qualifiedOr, { status: { in: ["contacted", "responded", "converted"] } }];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ websiteScore: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    // Total leads that exist in this segment (all statuses) — for "X z Y".
    prisma.lead.count({ where: segmentWhere }),
  ]);

  return NextResponse.json({ leads: leads.map(serializeLead), total });
}
