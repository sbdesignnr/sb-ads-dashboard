import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeBooking } from "@/lib/booking/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin: all upcoming bookings, soonest first.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const bookings = await prisma.booking.findMany({
    where: { date: { gte: today } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 200,
  });
  return NextResponse.json({ bookings: bookings.map(serializeBooking) });
}
