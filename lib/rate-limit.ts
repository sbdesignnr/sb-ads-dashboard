/**
 * Minimal in-memory rate limiter for login attempts.
 * Persists for the lifetime of the server process. For multi-instance
 * production deployments swap this for a Redis-backed limiter.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - entry.count,
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}
