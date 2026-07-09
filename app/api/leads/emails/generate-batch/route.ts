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

  // Generate in parallel batches so N leads don't run N sequential Claude calls
  // (which times out — the likely cause of "only 1 generated"). One failure
  // never blocks the rest of its batch.
  let generated = 0;
  let skippedSegment = 0;
  let failed = 0;
  const details: string[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    console.log(`Generating emails ${i + 1}-${Math.min(i + BATCH_SIZE, leads.length)} / ${leads.length}`);
    await Promise.all(
      batch.map(async (lead) => {
        try {
          const email = await generateOutreachEmail({
            lead,
            segmentName: lead.segment?.name ?? "firma",
            type: "initial",
          });
          if (email.skipReason) {
            skippedSegment++;
            details.push(`${lead.companyName}: preskočený (${email.skipReason})`);
            return;
          }
          if (!email.subject || !email.body) {
            failed++;
            details.push(`${lead.companyName}: prázdny email`);
            return;
          }
          await prisma.leadEmail.create({
            data: { leadId: lead.id, subject: email.subject, body: email.body, emailType: "initial", status: "draft" },
          });
          generated++;
        } catch (err) {
          failed++;
          details.push(`${lead.companyName}: chyba (${(err as Error).message.slice(0, 80)})`);
          console.error("Email gen failed for:", lead.companyName, err);
        }
      }),
    );
  }

  // New leads in scope we couldn't queue because they have no e-mail.
  const missingEmail = await prisma.lead.count({
    where: { status: "new", companyEmail: null, ...(segmentId ? { segmentId } : {}) },
  });

  return NextResponse.json({
    generated,
    skipped: skippedSegment + missingEmail,
    missingEmail, // leads skipped specifically for a missing e-mail (for the finder button)
    failed,
    details: details.slice(0, 50),
  });
}
