import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeBooking } from "@/lib/booking/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin: cancel a booking (frees its slot).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const booking = await prisma.booking.update({ where: { id }, data: { status: "cancelled" } });
    return NextResponse.json({ booking: serializeBooking(booking) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
