import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const KNOWN_STATUSES = [
  "new",
  "contacted",
  "responded",
  "converted",
  "rejected",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const segment = sp.get("segment"); // segmentId | "all" | "none"
  const status = sp.get("status") ?? "all"; // status | "all"
  const region = sp.get("region"); // názov kraja | "all" | "none" (Neznámy)

  const segmentWhere: Prisma.LeadWhereInput = {};
  if (segment && segment !== "all")
    segmentWhere.segmentId = segment === "none" ? null : segment;

  // Filter podľa stavu — rovnaká logika pre zoznam aj pre počty krajov.
  const statusWhere: Prisma.LeadWhereInput = KNOWN_STATUSES.includes(status)
    ? { status }
    : { status: { not: "rejected" } };

  // Show every lead in the segment regardless of score — the score is only a
  // quality indicator on the card, not a display filter. Only leads that are
  // explicitly rejected are hidden (and only from the default / "Všetky" view;
  // an explicit "rejected" tab still shows them).
  const where: Prisma.LeadWhereInput = { ...segmentWhere, ...statusWhere };
  if (region && region !== "all")
    where.region = region === "none" ? null : region;

  const [leads, total, regionGroups] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ websiteScore: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    // Total leads in this segment (all statuses) — for the "X z Y" counter.
    prisma.lead.count({ where: segmentWhere }),
    // Počty leadov po krajoch v aktuálnom segmente+stave (bez filtra na kraj, nech
    // vidno všetky kraje aj po výbere jedného).
    prisma.lead.groupBy({
      by: ["region"],
      where: { ...segmentWhere, ...statusWhere },
      _count: { _all: true },
    }),
  ]);

  const regions = regionGroups
    .map((g) => ({ region: g.region, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ leads: leads.map(serializeLead), total, regions });
}
