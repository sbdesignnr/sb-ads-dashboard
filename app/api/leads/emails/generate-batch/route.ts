import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateOutreachEmail } from "@/lib/leads/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generate an initial outreach email (draft) for each "new" lead that has an
// e-mail and no initial email yet.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  }

  let body: { segmentId?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }
  const limit = Math.min(Math.max(1, Number(body.limit) || 20), 50);
  const segmentId = body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined;

  const leads = await prisma.lead.findMany({
    where: {
      status: "new",
      companyEmail: { not: null },
      ...(segmentId ? { segmentId } : {}),
      emails: { none: { emailType: "initial" } },
    },
    include: { segment: true },
    orderBy: { websiteScore: "desc" },
    take: limit,
  });

  let generated = 0;
  for (const lead of leads) {
    try {
      const email = await generateOutreachEmail({
        lead,
        segmentName: lead.segment?.name ?? "firma",
        type: "initial",
      });
      if (!email.subject || !email.body) continue;
      await prisma.leadEmail.create({
        data: { leadId: lead.id, subject: email.subject, body: email.body, emailType: "initial", status: "draft" },
      });
      generated++;
    } catch {
      /* skip this lead, continue */
    }
  }

  // Informational: new leads in scope that were skipped for missing e-mail.
  const skipped = await prisma.lead.count({
    where: { status: "new", companyEmail: null, ...(segmentId ? { segmentId } : {}) },
  });

  return NextResponse.json({ generated, skipped });
}
