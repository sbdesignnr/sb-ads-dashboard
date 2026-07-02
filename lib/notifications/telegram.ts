// Telegram delivery for mobile push. The bot token is a secret (env only); the
// chat id is per-user and stored in NotificationSetting once the user messages
// the bot. Never import this from a client component.

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function telegramConfigured(): boolean {
  return Boolean(token());
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Send a message to a chat. `link` renders an inline "Otvoriť" button. */
export async function sendTelegram(
  chatId: string,
  text: string,
  opts: { link?: string; linkLabel?: string; silent?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const t = token();
  if (!t) return { ok: false, error: "TELEGRAM_BOT_TOKEN nie je nastavený." };
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    disable_notification: Boolean(opts.silent),
  };
  if (opts.link) {
    body.reply_markup = {
      inline_keyboard: [[{ text: opts.linkLabel ?? "Otvoriť dashboard", url: opts.link }]],
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Find the chat id of whoever last messaged the bot — used to link a phone
 * during setup (user sends /start, we grab their chat id).
 */
export async function getRecentChatId(): Promise<{ chatId: string; name: string } | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/getUpdates?limit=10`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { message?: { chat?: { id?: number; first_name?: string; username?: string } } }[];
    };
    if (!data.ok || !data.result?.length) return null;
    for (const u of [...data.result].reverse()) {
      const chat = u.message?.chat;
      if (chat?.id != null) {
        return { chatId: String(chat.id), name: chat.first_name ?? chat.username ?? "Telegram" };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export { escapeHtml };
