import { NextResponse, type NextRequest } from "next/server";
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
  const slots = generateSlots(date, settings, booked, new Date());
  return NextResponse.json({ date, slots });
}
