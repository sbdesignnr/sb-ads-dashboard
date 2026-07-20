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

  // "Oslovený" = lead so stavom kontaktovaný/reagoval/konvertovaný.
  const CONTACTED = ["contacted", "responded", "converted"];

  // Filter podľa stavu — rovnaká logika pre zoznam aj pre počty krajov. Záložka
  // „Oslovení" (status=contacted) zámerne pokrýva aj reagoval/konvertoval, nielen
  // presný stav „contacted".
  const statusWhere: Prisma.LeadWhereInput =
    status === "contacted"
      ? { status: { in: CONTACTED } }
      : KNOWN_STATUSES.includes(status)
        ? { status }
        : { status: { not: "rejected" } };

  // Show every lead in the segment regardless of score — the score is only a
  // quality indicator on the card, not a display filter. Only leads that are
  // explicitly rejected are hidden (and only from the default / "Všetky" view;
  // an explicit "rejected" tab still shows them).
  const where: Prisma.LeadWhereInput = { ...segmentWhere, ...statusWhere };
  if (region && region !== "all")
    where.region = region === "none" ? null : region;

  const [leads, total, contactedCount, regionGroups] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ websiteScore: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    // Total leads in this segment (all statuses) — for the "X z Y" counter.
    prisma.lead.count({ where: segmentWhere }),
    // Koľko z celého segmentu je už oslovených — pre súhrn „oslovených M z Y".
    prisma.lead.count({
      where: { ...segmentWhere, status: { in: CONTACTED } },
    }),
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

  // Dátum a počet reálne odoslaných outreach mailov pre zobrazené leady (jeden
  // dopyt cez groupBy) — nech karta vie ukázať „Oslovený · 14. 7.".
  const ids = leads.map((l) => l.id);
  const emailAgg = ids.length
    ? await prisma.leadEmail.groupBy({
        by: ["leadId"],
        where: { leadId: { in: ids }, status: "sent" },
        _max: { sentAt: true },
        _count: { _all: true },
      })
    : [];
  const emailMap = new Map(
    emailAgg.map((e) => [
      e.leadId,
      { contactedAt: e._max.sentAt, emailsSent: e._count._all },
    ]),
  );

  const out = leads.map((l) => {
    const em = emailMap.get(l.id);
    return {
      ...serializeLead(l),
      contactedAt: em?.contactedAt ? em.contactedAt.toISOString() : null,
      emailsSent: em?.emailsSent ?? 0,
    };
  });

  return NextResponse.json({ leads: out, total, contactedCount, regions });
}
