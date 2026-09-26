// Kredit na účte Anthropic: keď je prázdny, každé volanie AI zlyhá (400 "credit balance is too low").
// Odlišuje sa od mesačného rozpočtu agentov (ten je len vlastná poistka, nie zostatok na účte).
import Anthropic from "@anthropic-ai/sdk";

export const CREDIT_URL = "https://console.anthropic.com/settings/billing";
export const isCreditError = (s?: string | null) => /credit balance/i.test(s ?? "");

let cache: { at: number; ok: boolean } | null = null;

/** Má účet kredit? Krátka skúška (1 token, ≈ 0,00001 €), výsledok sa 10 min pamätá (prázdny kredit len 1 min, aby sa dobitie poznalo hneď). Neznáma chyba (sieť, 5xx) sa berie ako "v poriadku". */
export async function anthropicCreditOk(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return true;
  const ttl = cache && !cache.ok ? 60_000 : 600_000;
  if (cache && Date.now() - cache.at < ttl) return cache.ok;
  let ok = true;
  try {
    await new Anthropic().messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "ok" }] });
  } catch (e) {
    if (isCreditError((e as Error).message)) ok = false;
  }
  cache = { at: Date.now(), ok };
  return ok;
}
