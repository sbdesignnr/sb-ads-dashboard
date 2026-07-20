import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFollowUps } from "@/lib/leads/email-sender";

export const dynamic = "force-dynamic";

// Approve an email for sending. Approving an initial email queues its follow-ups.
// Optional body `{ scheduledAt }` (ISO) sets the exact earliest send time.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const email = await prisma.leadEmail.findUnique({ where: { id } });
  if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
        scheduledAt = null; // null / "" / undefined → zrušiť plán
      }
    }
  } catch {
    /* prázdne telo je v poriadku — schválenie bez naplánovania */
  }

  await prisma.leadEmail.update({
    where: { id },
    data: {
      status: "approved",
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    },
  });
  if (email.emailType === "initial") {
    await scheduleFollowUps(email.leadId, email.id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
