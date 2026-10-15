import { randomBytes } from "node:crypto";
import { enableBankingRequest } from "./client";

export type PsuType = "business" | "personal";

const ASPSP = { name: "Slovenská sporiteľňa", country: "SK" };
/** Súhlas banky platí najviac 180 dní (SLSP: 15 552 000 s), potom treba účet prepojiť znova. */
const CONSENT_DAYS = 179;

interface AuthResponse {
  url: string;
  authorization_id: string;
}

/**
 * Začne autorizáciu u banky: vráti URL, kam sa užívateľ presmeruje (prihlásenie do
 * internet bankingu + potvrdenie v mobilnej appke). `state` nesie typ účtu, aby ho
 * callback vedel priradiť k správnemu lokálnemu účtu.
 */
export async function createAuthUrl(psuType: PsuType, redirectUrl: string): Promise<string> {
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 86_400_000).toISOString();
  const res = await enableBankingRequest<AuthResponse>("/auth", {
    method: "POST",
    body: {
      access: { valid_until: validUntil },
      aspsp: ASPSP,
      state: `${psuType}.${randomBytes(8).toString("hex")}`,
      redirect_url: redirectUrl,
      psu_type: psuType,
    },
  });
  return res.url;
}

export function psuTypeFromState(state: string | null): PsuType {
  return state?.startsWith("personal.") ? "personal" : "business";
}
