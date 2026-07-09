import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendBookingReminder } from "@/lib/booking/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Logged-in user (manual) or the Vercel Cron secret.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

// Daily: e-mail a reminder for tomorrow's confirmed bookings.
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const due = await prisma.booking.findMany({
    where: { date: tomorrow, status: "confirmed", reminderSent: false },
  });

  let sent = 0;
  for (const b of due) {
    const ok = await sendBookingReminder(b).catch(() => false);
    if (ok) {
      await prisma.booking.update({ where: { id: b.id }, data: { reminderSent: true } });
      sent++;
    }
  }
  return NextResponse.json({ due: due.length, sent });
}
