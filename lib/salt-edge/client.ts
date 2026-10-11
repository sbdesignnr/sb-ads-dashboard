// Tenký fetch wrapper nad Salt Edge API v6 (https://docs.saltedge.com/v6/).
// Autentifikácia je statická (App-id + Secret hlavičky na každý request) —
// žiadny OAuth token na obnovovanie, žiadne šifrované úložisko potrebné.

const BASE_URL = "https://www.saltedge.com/api/v6";

export function isSaltEdgeConfigured(): boolean {
  return Boolean(process.env.SALT_EDGE_APP_ID && process.env.SALT_EDGE_SECRET);
}

export class SaltEdgeError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorClass?: string,
  ) {
    super(message);
    this.name = "SaltEdgeError";
  }
}

export async function saltEdgeRequest<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const appId = process.env.SALT_EDGE_APP_ID;
  const secret = process.env.SALT_EDGE_SECRET;
  if (!appId || !secret) throw new Error("SALT_EDGE_APP_ID / SALT_EDGE_SECRET nie sú nastavené");

  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "App-id": appId,
      Secret: secret,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `Salt Edge API ${res.status}`;
    throw new SaltEdgeError(message, res.status, json?.error?.class);
  }
  return json as T;
}
