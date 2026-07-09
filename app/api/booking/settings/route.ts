import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBookingSettings } from "@/lib/booking/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getBookingSettings() });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (Array.isArray(body.availableDays)) {
    data.availableDays = body.availableDays.map(Number).filter((n) => n >= 1 && n <= 7);
  }
  if (typeof body.startTime === "string" && /^\d{2}:\d{2}$/.test(body.startTime)) data.startTime = body.startTime;
  if (typeof body.endTime === "string" && /^\d{2}:\d{2}$/.test(body.endTime)) data.endTime = body.endTime;
  if (Number.isFinite(Number(body.duration))) data.duration = Math.max(5, Math.min(240, Number(body.duration)));
  if (Number.isFinite(Number(body.bufferTime))) data.bufferTime = Math.max(0, Math.min(240, Number(body.bufferTime)));
  if (Number.isFinite(Number(body.minNotice))) data.minNotice = Math.max(0, Math.min(720, Number(body.minNotice)));
  if (typeof body.timezone === "string" && body.timezone.trim()) data.timezone = body.timezone.trim();
  if (typeof body.ownerEmail === "string" && body.ownerEmail.trim()) data.ownerEmail = body.ownerEmail.trim();
  if (typeof body.ownerName === "string" && body.ownerName.trim()) data.ownerName = body.ownerName.trim();
  if (typeof body.meetingTitle === "string" && body.meetingTitle.trim()) data.meetingTitle = body.meetingTitle.trim();

  await getBookingSettings(); // ensure the row exists
  const settings = await prisma.bookingSetting.update({ where: { id: "primary" }, data });
  return NextResponse.json({ settings });
}
