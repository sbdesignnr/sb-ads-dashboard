import { NextResponse, type NextRequest } from "next/server";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getBookingSettings, generateSlots, dayUtc } from "@/lib/booking/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: available start-time slots for a given day (?date=YYYY-MM-DD).
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  const settings = await getBookingSettings();
  const bookings = await prisma.booking.findMany({
    where: { date: dayUtc(date), status: "confirmed" },
    select: { startTime: true },
  });
  const booked = new Set(bookings.map((b) => b.startTime));
  const now = new Date();
  const slots = generateSlots(date, settings, booked, now);

  console.log("[booking/slots] requested date:", date);
  console.log("[booking/slots] existing bookings:", bookings.length);
  console.log("[booking/slots] now SK:", toZonedTime(now, settings.timezone).toString());
  console.log("[booking/slots] minNotice(h):", settings.minNotice, "| generated slots:", slots);

  return NextResponse.json({ date, slots });
}
