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

/**
 * Telegram rejects an inline-keyboard button whose URL isn't a public http(s) one
 * ("Wrong HTTP URL") — and that failure kills the WHOLE message, not just the
 * button. A misconfigured NEXTAUTH_URL (e.g. http://localhost:3000) would then
 * silently stop every mobile notification. Drop the button instead.
 */
function publicUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return undefined;
    if (!host.includes(".")) return undefined; // bare host, no TLD
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Send a message to a chat. `link` renders an inline "Otvoriť" button. */
export async function sendTelegram(
  chatId: string,
  text: string,
  opts: { link?: string; linkLabel?: string; silent?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const t = token();
  if (!t) return { ok: false, error: "TELEGRAM_BOT_TOKEN nie je nastavený." };
  const base: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    disable_notification: Boolean(opts.silent),
  };
  const link = publicUrl(opts.link);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    return { ok: Boolean(data.ok), error: data.ok ? undefined : data.description ?? `HTTP ${res.status}` };
  };

  try {
    if (!link) return await post(base);
    const first = await post({
      ...base,
      reply_markup: { inline_keyboard: [[{ text: opts.linkLabel ?? "Otvoriť dashboard", url: link }]] },
    });
    if (first.ok) return first;
    // The message matters more than the button.
    console.warn("[telegram] button rejected, retrying without it:", first.error);
    return await post(base);
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
