import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateOutreachEmail } from "@/lib/leads/ai";
import { serializeLeadEmail } from "@/lib/leads/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// (Re)generate the subject + body for an email — used for follow-ups queued with
// an empty body, or to refresh an initial draft.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "AI nie je nakonfigurované." },
      { status: 503 },
    );
  const { id } = await params;

  const email = await prisma.leadEmail.findUnique({
    where: { id },
    include: { lead: { include: { segment: true } } },
  });
  if (!email?.lead)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const type = (
    ["initial", "followup1", "followup2"].includes(email.emailType)
      ? email.emailType
      : "initial"
  ) as "initial" | "followup1" | "followup2";

  // Follow-ups reference the initial email in the thread.
  let previousSubject: string | null = null;
  let previousBody: string | null = null;
  if (type !== "initial") {
    const initial = await prisma.leadEmail.findFirst({
      where: { leadId: email.leadId, emailType: "initial" },
      orderBy: { createdAt: "asc" },
    });
    previousSubject = initial?.subject ?? null;
    previousBody = initial?.body ?? null;
  }

  try {
    const out = await generateOutreachEmail({
      lead: email.lead,
      segmentName: email.lead.segment?.name ?? "firma",
      type,
      previousSubject,
      previousBody,
    });
    const updated = await prisma.leadEmail.update({
      where: { id },
      data: { subject: out.subject, body: out.body },
      include: { lead: { include: { segment: { select: { name: true } } } } },
    });
    return NextResponse.json({ email: serializeLeadEmail(updated) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
