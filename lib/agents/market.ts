// Trh, na ktorom agenti pracujú. Rozhodnutie usera (25. 9. 2026): najprv len Slovensko; český trh
// sa otvorí až keď na Slovensku už nie je koho nájsť (posledné skeny nenašli nové firmy).
// Prepísať sa dá premennou AGENT_MARKET = SK | BOTH.
import type { Prisma } from "@prisma/client";
import { CZ_KRAJE } from "@/lib/leads/regions-map";
import { AGENTS_START } from "./budget";
import { listNotes } from "./notes";

export type Market = "SK" | "both";

/** Toľko po sebe idúcich skenov bez novej firmy znamená, že slovenský trh je vyčerpaný. */
export const EXHAUST_SCANS = 4;
/** Sken s najviac toľkými novými firmami sa počíta ako "nič nové". */
export const EXHAUST_FRESH_MAX = 1;

const CZ_COUNTRY = ["CZ", "Czech Republic", "Czechia", "Česko", "Česká republika"];

/** Databázová podmienka "lead nie je český". Každá časť ošetruje NULL (NOT nad NULL by riadok vyradil). */
export const slovakOnlyWhere = (): Prisma.LeadWhereInput => ({
  AND: [
    { OR: [{ source: null }, { source: { not: "google-places-cz" } }] },
    { OR: [{ region: null }, { region: { notIn: CZ_KRAJE } }] },
    { OR: [{ country: null }, { country: { notIn: CZ_COUNTRY } }] },
    { OR: [{ companyPhone: null }, { companyPhone: { not: { startsWith: "+420" } } }] },
    { OR: [{ companyPhone: null }, { companyPhone: { not: { startsWith: "00420" } } }] },
    { OR: [{ websiteUrl: null }, { websiteUrl: { not: { contains: ".cz" } } }] },
  ],
});

/** Filter podľa trhu: pri "both" nič, inak len slovenské leady. */
export const marketWhere = (market: Market): Prisma.LeadWhereInput => (market === "SK" ? slovakOnlyWhere() : {});

/** Ktorý trh je teraz aktívny (predvolene Slovensko; české firmy až po vyčerpaní slovenského trhu). */
export async function agentMarket(): Promise<{ market: Market; reason: string }> {
  const env = process.env.AGENT_MARKET?.trim().toUpperCase();
  if (env === "SK") return { market: "SK", reason: "Slovensko (nastavené v AGENT_MARKET)" };
  if (env === "BOTH" || env === "SK+CZ") return { market: "both", reason: "Slovensko aj Česko (nastavené v AGENT_MARKET)" };
  const recent = (await listNotes({ kind: "scan", since: AGENTS_START }, 40)).filter((n) => {
    const d = n.data as { market?: string; error?: string | null } | null;
    return d?.market === "SK" && !d.error;
  });
  const last = recent.slice(0, EXHAUST_SCANS);
  const exhausted = last.length >= EXHAUST_SCANS && last.every((n) => ((n.data as { fresh?: number } | null)?.fresh ?? 99) <= EXHAUST_FRESH_MAX);
  if (exhausted) return { market: "both", reason: `Slovenský trh je vyčerpaný (posledné ${EXHAUST_SCANS} skeny nenašli nové firmy), otvorený je aj český` };
  return { market: "SK", reason: "Slovensko" };
}
