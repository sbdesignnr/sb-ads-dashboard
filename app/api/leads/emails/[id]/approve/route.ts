import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFollowUps } from "@/lib/leads/email-sender";
import { defaultSendSchedule } from "@/lib/leads/schedule";

export const dynamic = "force-dynamic";

// Approve an email for sending. Approving an initial email queues its follow-ups.
// Optional body `{ scheduledAt }` (ISO) sets an exact custom send time. If none is
// given (and the email has no future schedule), we stamp it with the NEXT daily
// send time of the covering campaign — so an email approved after today's send
// time goes out tomorrow, not a few minutes later.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const email = await prisma.leadEmail.findUnique({
    where: { id },
    select: {
      emailType: true,
      leadId: true,
      scheduledAt: true,
      lead: { select: { segmentId: true } },
    },
  });
  if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();

  // Vlastný čas z tela (editor s dátumovým poľom) má prednosť.
  let scheduledAt: Date | null | undefined;
  try {
    const b = (await req.json()) as { scheduledAt?: string | null };
    if (b && "scheduledAt" in b) {
      if (typeof b.scheduledAt === "string" && b.scheduledAt !== "") {
        const d = new Date(b.scheduledAt);
        if (Number.isNaN(d.getTime()))
          return NextResponse.json(
            { error: "invalid_scheduledAt" },
            { status: 400 },
          );
        scheduledAt = d;
      } else {
        scheduledAt = null; // výslovne bez vlastného času
      }
    }
  } catch {
    /* prázdne telo je v poriadku */
  }

  // Bez výslovného času z tela a bez budúceho naplánovania → naplánuj na
  // najbližší denný čas kampane.
  if (
    scheduledAt === undefined &&
    (!email.scheduledAt || email.scheduledAt <= now)
  ) {
    const def = await defaultSendSchedule(email.lead.segmentId, now);
    if (def) scheduledAt = def;
  }

  const updated = await prisma.leadEmail.update({
    where: { id },
    data: {
      status: "approved",
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    },
    select: { scheduledAt: true },
  });
  if (email.emailType === "initial") {
    await scheduleFollowUps(email.leadId, id).catch(() => {});
  }
  return NextResponse.json({
    ok: true,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
  });
}
