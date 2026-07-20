import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/emails/summary?segment=<id|all>
 *
 * Prehľad pre kampaň: koľko leadov máš zo skenov v segmente, koľko je oslovených,
 * koľko neoslovených, koľko mailov čaká (koncepty / schválené) a koľko leadov nemá
 * e-mail (nedajú sa osloviť).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const segment = req.nextUrl.searchParams.get("segment");
  const segmentId = segment && segment !== "all" ? segment : undefined;
  const leadSeg: Prisma.LeadWhereInput = segmentId ? { segmentId } : {};
  const emailSeg: Prisma.LeadEmailWhereInput = segmentId
    ? { lead: { segmentId } }
    : {};

  const CONTACTED = ["contacted", "responded", "converted"];
  const hasEmail = {
    companyEmail: { not: null },
    NOT: { companyEmail: "" },
  } as const;

  const [
    leadsTotal,
    withEmail,
    contacted,
    notContacted,
    drafts,
    approved,
    noEmail,
  ] = await Promise.all([
    // Leady zo skenov (bez zamietnutých).
    prisma.lead.count({ where: { ...leadSeg, status: { not: "rejected" } } }),
    prisma.lead.count({
      where: { ...leadSeg, status: { not: "rejected" }, ...hasEmail },
    }),
    prisma.lead.count({ where: { ...leadSeg, status: { in: CONTACTED } } }),
    prisma.lead.count({ where: { ...leadSeg, status: "new" } }),
    // Koncepty (initial) čakajúce na schválenie a už schválené maily.
    prisma.leadEmail.count({
      where: { ...emailSeg, status: "draft", emailType: "initial" },
    }),
    prisma.leadEmail.count({ where: { ...emailSeg, status: "approved" } }),
    // Neoslovené leady bez e-mailu — tie treba najskôr dohľadať.
    prisma.lead.count({
      where: {
        ...leadSeg,
        status: "new",
        OR: [{ companyEmail: null }, { companyEmail: "" }],
      },
    }),
  ]);

  return NextResponse.json({
    leadsTotal,
    withEmail,
    contacted,
    notContacted,
    drafts,
    approved,
    noEmail,
  });
}
