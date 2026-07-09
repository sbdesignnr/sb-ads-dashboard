import { prisma } from "@/lib/prisma";
import type { Booking, BookingSetting } from "@prisma/client";

/** Get (or lazily create) the singleton booking settings row. */
export async function getBookingSettings(): Promise<BookingSetting> {
  return prisma.bookingSetting.upsert({ where: { id: "primary" }, update: {}, create: { id: "primary" } });
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** The end time of a slot, e.g. slotEndTime("10:00", 30) → "10:30". */
export function slotEndTime(startTime: string, duration: number): string {
  return toHHMM(toMinutes(startTime) + duration);
}

/** UTC midnight for a "YYYY-MM-DD" calendar day (how bookings store `date`). */
export function dayUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** ISO weekday for a "YYYY-MM-DD" day: 1=Mon … 7=Sun. */
export function isoWeekday(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return jsDay === 0 ? 7 : jsDay;
}

/** UTC instant for a wall-clock HH:MM on dateStr in the given IANA timezone. */
function zonedToUtc(dateStr: string, time: string, timeZone: string): Date {
  const naive = new Date(`${dateStr}T${time}:00Z`);
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTz = new Date(naive.toLocaleString("en-US", { timeZone }));
  const offsetMin = (asTz.getTime() - asUtc.getTime()) / 60000;
  return new Date(naive.getTime() - offsetMin * 60000);
}

/**
 * Available start-time slots for one day: all configured slots, minus ones that
 * are already booked and ones that fall inside the minimum-notice window.
 */
export function generateSlots(dateStr: string, settings: BookingSetting, booked: Set<string>, now: Date): string[] {
  if (!settings.availableDays.includes(isoWeekday(dateStr))) return [];
  const step = settings.duration + settings.bufferTime;
  const startM = toMinutes(settings.startTime);
  const endM = toMinutes(settings.endTime);
  const minNoticeMs = settings.minNotice * 3_600_000;

  const slots: string[] = [];
  for (let m = startM; m + settings.duration <= endM; m += step) {
    const time = toHHMM(m);
    if (booked.has(time)) continue;
    if (zonedToUtc(dateStr, time, settings.timezone).getTime() < now.getTime() + minNoticeMs) continue;
    slots.push(time);
  }
  return slots;
}

export interface BookingDTO {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  clientCompany: string | null;
  message: string | null;
  status: string;
  googleMeetLink: string | null;
  createdAt: string;
}

export function serializeBooking(b: Booking): BookingDTO {
  return {
    id: b.id,
    date: b.date.toISOString().slice(0, 10),
    startTime: b.startTime,
    endTime: b.endTime,
    clientName: b.clientName,
    clientEmail: b.clientEmail,
    clientPhone: b.clientPhone,
    clientCompany: b.clientCompany,
    message: b.message,
    status: b.status,
    googleMeetLink: b.googleMeetLink,
    createdAt: b.createdAt.toISOString(),
  };
}
