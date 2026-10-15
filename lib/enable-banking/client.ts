// Tenký fetch wrapper nad Enable Banking API (https://enablebanking.com/docs/api/reference/).
// Autentifikácia: krátko žijúci JWT (RS256) podpísaný súkromným kľúčom aplikácie,
// `kid` = application id. Žiadny token na obnovovanie, všetko sa podpisuje pri každom volaní.
import { createSign } from "node:crypto";

const BASE_URL = "https://api.enablebanking.com";

export function isEnableBankingConfigured(): boolean {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

export class EnableBankingError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "EnableBankingError";
  }
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

function makeJwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID?.trim();
  // v env premennej je PEM s doslovnými "\n" (jeden riadok)
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !key) throw new Error("ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY nie sú nastavené");

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const payload = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

export async function enableBankingRequest<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${makeJwt()}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EnableBankingError(json?.message || `Enable Banking API ${res.status}`, res.status, json?.error);
  }
  return json as T;
}
