import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { QUALIFY_AT, BORDERLINE_AT, scoreTier } from "@/lib/leads/qualification";
import { isEditedByHand, isLegacyDraft } from "@/lib/leads/draft-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/emails/queue-health?segment=
 *
 * Prečo fronta ukazuje viac konceptov než je vhodných leadov: koncepty vznikli v
 * čase, keď bol lead vyhodnotený inak. Tu sa každý koncept porovná s AKTUÁLNYM
 * skóre jeho leadu, aby bolo vidieť, koľko konceptov je pre vhodné leady a koľko
 * pre leady, ktoré už vhodné nie sú.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seg = req.nextUrl.searchParams.get("segment");
  const segFilter: Prisma.LeadWhereInput =
    seg && seg !== "all" ? { segmentId: seg } : {};
  const leadsBase: Prisma.LeadWhereInput = { status: "new", ...segFilter };

  const [qualified, borderline, good, unscored, qualifiedNoDraft, drafts] =
    await Promise.all([
      prisma.lead.count({ where: { ...leadsBase, websiteScore: { gte: QUALIFY_AT } } }),
      prisma.lead.count({
        where: { ...leadsBase, websiteScore: { gte: BORDERLINE_AT, lt: QUALIFY_AT } },
      }),
      prisma.lead.count({ where: { ...leadsBase, websiteScore: { lt: BORDERLINE_AT } } }),
      prisma.lead.count({ where: { ...leadsBase, websiteScore: null } }),
      prisma.lead.count({
        where: {
          ...leadsBase,
          websiteScore: { gte: QUALIFY_AT },
          companyEmail: { not: null },
          NOT: { companyEmail: "" },
          emails: { none: { emailType: "initial" } },
        },
      }),
      prisma.leadEmail.findMany({
        // Aj koncepty leadov, ktoré sa medzitým skryli (status "rejected") — v rade
        // by nemali čakať na schválenie.
        where: {
          emailType: "initial",
          status: "draft",
          lead: { status: { in: ["new", "rejected"] }, ...segFilter },
        },
        select: {
          emailType: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lead: { select: { websiteScore: true, ownerSource: true, status: true } },
        },
      }),
    ]);

  const d = { qualified: 0, borderline: 0, good: 0, unscored: 0, hidden: 0 };
  let legacyQualified = 0;
  let editedUnsuitable = 0;
  let qualifiedVerified = 0;
  for (const e of drafts) {
    const tier = e.lead.status === "rejected" ? "hidden" : scoreTier(e.lead.websiteScore);
    d[tier]++;
    if (tier === "qualified") {
      if (isLegacyDraft(e)) legacyQualified++;
      if (e.lead.ownerSource) qualifiedVerified++;
    } else if (isEditedByHand(e)) editedUnsuitable++;
  }

  return NextResponse.json({
    leads: { qualified, borderline, good, unscored },
    drafts: { total: drafts.length, ...d },
    unsuitableDrafts: d.borderline + d.good + d.unscored + d.hidden,
    legacyQualified,
    editedUnsuitable,
    qualifiedVerified,
    qualifiedNoDraft,
  });
}
