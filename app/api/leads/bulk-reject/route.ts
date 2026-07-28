import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hromadné skrytie leadov s dobrým webom: nastaví status="rejected" leadom, ktoré
// sú analyzované a majú skóre pod prahom. Zamietnuté zmiznú zo zoznamu (ostanú v
// DB, dá sa vrátiť) a ďalší scan ich už znovu nepridá.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { segment?: string; maxScore?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const maxScore = Number(body.maxScore);
  if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 100)
    return NextResponse.json({ error: "invalid_maxScore" }, { status: 400 });

  const where: Prisma.LeadWhereInput = {
    // Len ešte neoslovené leady — kontaktované/reagované nechávame na pokoji.
    status: "new",
    // `lt` automaticky vynechá NULL (nezanalyzované) — tie neskrývame.
    websiteScore: { lt: maxScore },
  };
  if (body.segment && body.segment !== "all")
    where.segmentId = body.segment === "none" ? null : body.segment;

  const res = await prisma.lead.updateMany({
    where,
    data: {
      status: "rejected",
      disqualifyReason: "Web v poriadku — skryté hromadne.",
    },
  });

  return NextResponse.json({ rejected: res.count });
}
