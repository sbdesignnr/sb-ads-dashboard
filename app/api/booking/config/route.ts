import { NextResponse } from "next/server";
import { getBookingSettings, firstAvailableDate } from "@/lib/booking/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the minimum config the booking calendar needs (no admin fields).
export async function GET() {
  const s = await getBookingSettings();
  return NextResponse.json({
    availableDays: s.availableDays,
    duration: s.duration,
    ownerName: s.ownerName,
    meetingTitle: s.meetingTitle,
    timezone: s.timezone,
    minNotice: s.minNotice,
    // Earliest day that actually has slots — the calendar disables anything before it.
    firstAvailableDate: firstAvailableDate(s, new Date()),
  });
}
