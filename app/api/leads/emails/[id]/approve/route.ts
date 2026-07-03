import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFollowUps } from "@/lib/leads/email-sender";

export const dynamic = "force-dynamic";

// Approve an email for sending. Approving an initial email queues its follow-ups.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const email = await prisma.leadEmail.findUnique({ where: { id } });
  if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.leadEmail.update({ where: { id }, data: { status: "approved" } });
  if (email.emailType === "initial") {
    await scheduleFollowUps(email.leadId, email.id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
