import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const KNOWN_STATUSES = ["new", "contacted", "responded", "converted", "rejected"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const segment = sp.get("segment"); // segmentId | "all" | "none"
  const status = sp.get("status") ?? "all"; // status | "all"

  const segmentWhere: Prisma.LeadWhereInput = {};
  if (segment && segment !== "all") segmentWhere.segmentId = segment === "none" ? null : segment;

  // Show every lead in the segment regardless of score — the score is only a
  // quality indicator on the card, not a display filter. Only leads that are
  // explicitly rejected are hidden (and only from the default / "Všetky" view;
  // an explicit "rejected" tab still shows them).
  const where: Prisma.LeadWhereInput = { ...segmentWhere };
  if (KNOWN_STATUSES.includes(status)) {
    where.status = status;
  } else {
    where.status = { not: "rejected" };
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ websiteScore: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    // Total leads in this segment (all statuses) — for the "X z Y" counter.
    prisma.lead.count({ where: segmentWhere }),
  ]);

  return NextResponse.json({ leads: leads.map(serializeLead), total });
}
