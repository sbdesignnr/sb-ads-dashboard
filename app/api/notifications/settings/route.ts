import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/notifications/settings";
import { telegramConfigured } from "@/lib/notifications/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getNotificationSettings();
  return NextResponse.json({
    settings: {
      telegramLinked: Boolean(s.telegramChatId),
      enabled: s.enabled,
      alertConversions: s.alertConversions,
      alertActions: s.alertActions,
      alertBlog: s.alertBlog,
      blogReminderDay: s.blogReminderDay,
      blogReminderHour: s.blogReminderHour,
      minConversionValue: s.minConversionValue,
      quietHoursStart: s.quietHoursStart,
      quietHoursEnd: s.quietHoursEnd,
    },
    telegramConfigured: telegramConfigured(),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.alertConversions === "boolean") patch.alertConversions = body.alertConversions;
  if (typeof body.alertActions === "boolean") patch.alertActions = body.alertActions;
  if (typeof body.alertBlog === "boolean") patch.alertBlog = body.alertBlog;
  if (body.minConversionValue === null || typeof body.minConversionValue === "number")
    patch.minConversionValue = body.minConversionValue;
  const hour = (v: unknown) => (v === null ? null : typeof v === "number" && v >= 0 && v <= 23 ? Math.floor(v) : undefined);
  if ("quietHoursStart" in body) { const h = hour(body.quietHoursStart); if (h !== undefined) patch.quietHoursStart = h; }
  if ("quietHoursEnd" in body) { const h = hour(body.quietHoursEnd); if (h !== undefined) patch.quietHoursEnd = h; }
  // Blog reminder schedule: ISO weekday 1-7, hour 0-23 (Europe/Bratislava).
  if (typeof body.blogReminderDay === "number" && body.blogReminderDay >= 1 && body.blogReminderDay <= 7)
    patch.blogReminderDay = Math.floor(body.blogReminderDay);
  if (typeof body.blogReminderHour === "number" && body.blogReminderHour >= 0 && body.blogReminderHour <= 23)
    patch.blogReminderHour = Math.floor(body.blogReminderHour);
  const s = await updateNotificationSettings(patch);
  return NextResponse.json({ ok: true, settings: { telegramLinked: Boolean(s.telegramChatId), enabled: s.enabled } });
}
