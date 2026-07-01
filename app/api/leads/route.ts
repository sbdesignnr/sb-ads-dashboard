import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "rejected", "converted"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const segment = sp.get("segment"); // segmentId | "all" | "none"
  const status = sp.get("status"); // status | "all"

  const where: Prisma.LeadWhereInput = {};
  if (segment && segment !== "all") where.segmentId = segment === "none" ? null : segment;
  if (status && status !== "all" && STATUSES.includes(status)) where.status = status;

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ websiteScore: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return NextResponse.json({ leads: leads.map(serializeLead) });
}
