import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getRecentChatId, telegramConfigured } from "@/lib/notifications/telegram";
import { updateNotificationSettings } from "@/lib/notifications/settings";
import { sendTestNotification } from "@/lib/notifications/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!telegramConfigured()) {
    return NextResponse.json({ error: "Chýba TELEGRAM_BOT_TOKEN v premenných prostredia." }, { status: 400 });
  }
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* default */
  }

  if (body.action === "test") {
    const res = await sendTestNotification();
    return res.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: res.error ?? "Odoslanie zlyhalo." }, { status: 400 });
  }

  // Default: link — find whoever last messaged the bot and store their chat id.
  const chat = await getRecentChatId();
  if (!chat) {
    return NextResponse.json(
      { error: "Nenašiel som žiadnu správu. Napíš botovi na Telegrame (napr. /start) a skús znova." },
      { status: 404 },
    );
  }
  await updateNotificationSettings({ telegramChatId: chat.chatId });
  return NextResponse.json({ ok: true, name: chat.name });
}
