import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateOutreachEmail } from "@/lib/leads/ai";
import { getPriorThreadEmails } from "@/lib/leads/email-sender";
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
    ["initial", "followup1", "followup2", "followup3"].includes(
      email.emailType,
    )
      ? email.emailType
      : "initial"
  ) as "initial" | "followup1" | "followup2" | "followup3";

  // Follow-ups referencujú celé predchádzajúce vlákno (nie len initial), nech
  // model vie, aké fakty/uhly sa už použili a nezopakuje ich.
  const previousEmails =
    type !== "initial" ? await getPriorThreadEmails(email.leadId, type) : [];
  const previousSubject = previousEmails[0]?.subject ?? null;

  try {
    const out = await generateOutreachEmail({
      lead: email.lead,
      segmentName: email.lead.segment?.name ?? "firma",
      type,
      previousEmails,
    });
    // Follow-up ide ako ODPOVEĎ → predmet je „Re: <pôvodný predmet>", nech to tak
    // vidno aj vo fronte (odoslanie to potvrdí aj vláknením).
    const subject =
      type !== "initial" && previousSubject
        ? `Re: ${previousSubject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}`
        : out.subject;
    const updated = await prisma.leadEmail.update({
      where: { id },
      // createdAt = teraz: znovu vygenerovaný koncept sa nesmie tváriť ako ručne upravený.
      data: { subject, body: out.body, createdAt: new Date() },
      include: { lead: { include: { segment: { select: { name: true } } } } },
    });
    return NextResponse.json({ email: serializeLeadEmail(updated) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
