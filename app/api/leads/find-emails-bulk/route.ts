import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findEmailForLead } from "@/lib/leads/email-finder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bulk email discovery for existing leads that still have no contact e-mail.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Optional segment scope (so the campaign page can search just its segment).
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body — search across all segments */
  }
  const segmentId = body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined;

  const leads = await prisma.lead.findMany({
    where: {
      websiteUrl: { not: null },
      status: { not: "rejected" },
      OR: [{ companyEmail: null }, { companyEmail: "" }],
      ...(segmentId ? { segmentId } : {}),
    },
    select: { id: true, companyName: true, websiteUrl: true },
    take: 30,
  });

  let found = 0;
  let notFound = 0;
  const BATCH = 3; // parallel, but bounded — the finder does several fetches per lead
  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    console.log(`find-emails-bulk: ${i + 1}-${Math.min(i + BATCH, leads.length)} / ${leads.length}`);
    await Promise.all(
      batch.map(async (lead) => {
        try {
          const email = await findEmailForLead(lead.websiteUrl, lead.companyName);
          if (email) {
            await prisma.lead.update({ where: { id: lead.id }, data: { companyEmail: email } });
            found++;
          } else {
            notFound++;
          }
        } catch {
          notFound++;
        }
      }),
    );
  }

  return NextResponse.json({ processed: leads.length, found, notFound });
}
