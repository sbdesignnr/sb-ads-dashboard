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
  if (body.minConversionValue === null || typeof body.minConversionValue === "number")
    patch.minConversionValue = body.minConversionValue;
  const hour = (v: unknown) => (v === null ? null : typeof v === "number" && v >= 0 && v <= 23 ? Math.floor(v) : undefined);
  if ("quietHoursStart" in body) { const h = hour(body.quietHoursStart); if (h !== undefined) patch.quietHoursStart = h; }
  if ("quietHoursEnd" in body) { const h = hour(body.quietHoursEnd); if (h !== undefined) patch.quietHoursEnd = h; }
  const s = await updateNotificationSettings(patch);
  return NextResponse.json({ ok: true, settings: { telegramLinked: Boolean(s.telegramChatId), enabled: s.enabled } });
}
