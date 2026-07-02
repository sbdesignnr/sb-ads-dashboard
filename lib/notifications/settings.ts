import { prisma } from "@/lib/prisma";
import type { NotificationSetting } from "@prisma/client";

const ID = "primary";

export async function getNotificationSettings(): Promise<NotificationSetting> {
  const existing = await prisma.notificationSetting.findUnique({ where: { id: ID } });
  if (existing) return existing;
  return prisma.notificationSetting.create({ data: { id: ID } });
}

export async function updateNotificationSettings(
  patch: Partial<Omit<NotificationSetting, "id" | "updatedAt">>,
): Promise<NotificationSetting> {
  return prisma.notificationSetting.upsert({
    where: { id: ID },
    update: patch,
    create: { id: ID, ...patch },
  });
}

/**
 * Quiet hours are in Bratislava local time (Europe/Bratislava). A window like
 * 22→7 wraps midnight. Critical alerts ignore this (handled by the caller).
 */
export function inQuietHours(settings: NotificationSetting, now = new Date()): boolean {
  const { quietHoursStart: s, quietHoursEnd: e } = settings;
  if (s == null || e == null || s === e) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Bratislava" }).format(now),
  ) % 24;
  return s < e ? hour >= s && hour < e : hour >= s || hour < e;
}
