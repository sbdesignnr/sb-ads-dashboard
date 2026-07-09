import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBookingSettings, generateSlots, dayUtc, slotEndTime, serializeBooking } from "@/lib/booking/store";
import { createMeetLink } from "@/lib/booking/google-meet";
import { sendBookingConfirmation, sendBookingNotification } from "@/lib/booking/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public: create a booking, e-mail the client + the owner.
export async function POST(req: NextRequest) {
  let body: {
    date?: string;
    startTime?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientCompany?: string;
    message?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const date = (body.date ?? "").trim();
  const startTime = (body.startTime ?? "").trim();
  const clientName = (body.clientName ?? "").trim();
  const clientEmail = (body.clientEmail ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }
  if (!clientName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail)) {
    return NextResponse.json({ error: "invalid_contact" }, { status: 400 });
  }

  const settings = await getBookingSettings();

  // The slot must still be free and valid (available day, within hours + notice).
  const taken = await prisma.booking.findFirst({
    where: { date: dayUtc(date), startTime, status: "confirmed" },
    select: { id: true },
  });
  if (taken) return NextResponse.json({ error: "slot_taken" }, { status: 409 });
  if (!generateSlots(date, settings, new Set(), new Date()).includes(startTime)) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  const googleMeetLink = await createMeetLink().catch(() => null);

  const booking = await prisma.booking.create({
    data: {
      date: dayUtc(date),
      startTime,
      endTime: slotEndTime(startTime, settings.duration),
      clientName,
      clientEmail,
      clientPhone: body.clientPhone?.trim() || null,
      clientCompany: body.clientCompany?.trim() || null,
      message: body.message?.trim() || null,
      googleMeetLink,
    },
  });

  // E-mails are best-effort — never fail the booking on a send error.
  console.log("[booking/create] booking created:", booking.id, "→ emailing client", booking.clientEmail, "+ owner", settings.ownerEmail);
  const [confirmationSent, notificationSent] = await Promise.all([
    sendBookingConfirmation(booking).catch((e) => {
      console.error("[booking/create] confirmation email error:", e);
      return false;
    }),
    sendBookingNotification(booking, settings.ownerEmail).catch((e) => {
      console.error("[booking/create] notification email error:", e);
      return false;
    }),
  ]);
  console.log("[booking/create] email results — confirmation:", confirmationSent, "| notification:", notificationSent);

  return NextResponse.json({ booking: serializeBooking(booking), confirmationSent });
}
