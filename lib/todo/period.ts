/**
 * Obdobia pre ciele (týždeň / mesiac / rok) a prácu s dňami.
 *
 * Dni cestujú po sieti ako "YYYY-MM-DD" (nie ako ISO timestamp) — inak by sa
 * úloha naplánovaná na pondelok zobrazila v nedeľu každému, kto je západne od
 * Greenwichu. V DB je stĺpec typu `date`, takže Prisma vracia polnoc v UTC;
 * `toDayKey` / `fromDayKey` sú jediné dve miesta, kde sa to prekladá.
 */

export type Period = "week" | "month" | "year";
export type Priority = "urgent" | "high" | "normal" | "low";

export const PERIODS: Period[] = ["week", "month", "year"];

export const PERIOD_LABEL: Record<Period, string> = {
  week: "Týždenné",
  month: "Mesačné",
  year: "Ročné",
};

export const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Súrne",
  high: "Vysoká",
  normal: "Bežná",
  low: "Nízka",
};

/** Zoradenie: súrne najvyššie. */
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function isPriority(v: unknown): v is Priority {
  return typeof v === "string" && (PRIORITIES as string[]).includes(v);
}

export function isPeriod(v: unknown): v is Period {
  return typeof v === "string" && (PERIODS as string[]).includes(v);
}

// ── Dni ──────────────────────────────────────────────────────────────────────

/** Date → "YYYY-MM-DD" v lokálnom čase (klient) alebo v UTC (DB `date` stĺpec). */
export function toDayKey(d: Date, utc = false): string {
  const y = utc ? d.getUTCFullYear() : d.getFullYear();
  const m = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = utc ? d.getUTCDate() : d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → Date na polnoci UTC (presne to, čo očakáva stĺpec typu `date`). */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isDayKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Posun o N dní (kladné aj záporné), v lokálnom čase. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toDayKey(dt);
}

/** "13. júla 2026" — rok sa vynecháva, ak je to tento rok. Intl rieši skloňovanie. */
export function formatDay(key: string, today: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = y === Number(today.slice(0, 4));
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(y, m - 1, d));
}

/** "Dnes" / "Zajtra" / "Včera", inak názov dňa v týždni. */
export function dayLabel(key: string, today: string): string {
  if (key === today) return "Dnes";
  if (key === addDays(today, 1)) return "Zajtra";
  if (key === addDays(today, -1)) return "Včera";
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("sk-SK", { weekday: "long" }).format(
    new Date(y, m - 1, d),
  );
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

// ── Obdobia ──────────────────────────────────────────────────────────────────

/** ISO 8601 týždeň (pondelok = 1. deň, týždeň 1 obsahuje prvý štvrtok roka). */
function isoWeek(
  y: number,
  m: number,
  d: number,
): { year: number; week: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7; // po=1 … ne=7
  t.setUTCDate(t.getUTCDate() + 4 - dow); // štvrtok tohto týždňa určuje rok
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7,
  );
  return { year: t.getUTCFullYear(), week };
}

/** Kľúč obdobia, do ktorého daný deň spadá: "2026-W29" | "2026-07" | "2026". */
export function periodKeyFor(period: Period, dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (period === "year") return String(y);
  if (period === "month") return `${y}-${String(m).padStart(2, "0")}`;
  const { year, week } = isoWeek(y, m, d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Pondelok a nedeľa daného ISO týždňa. */
function weekRange(year: number, week: number): [string, string] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return [toDayKey(monday, true), toDayKey(sunday, true)];
}

/** Ľudský názov obdobia: "Týždeň 29 · 13. 7. – 19. 7." | "Júl 2026" | "2026". */
export function periodLabel(period: Period, key: string): string {
  if (period === "year") return key;
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    const name = new Intl.DateTimeFormat("sk-SK", { month: "long" }).format(
      new Date(y, m - 1, 1),
    );
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
  }
  const [ys, ws] = key.split("-W");
  const [from, to] = weekRange(Number(ys), Number(ws));
  const short = (k: string) => {
    const [, mm, dd] = k.split("-").map(Number);
    return `${dd}. ${mm}.`;
  };
  return `Týždeň ${Number(ws)} · ${short(from)} – ${short(to)}`;
}

/** Koľko dní z obdobia ešte zostáva (vrátane dneška). Slúži na "zostáva 5 dní". */
export function daysLeftIn(period: Period, key: string, today: string): number {
  const dayMs = 86_400_000;
  const t = fromDayKey(today).getTime();
  let end: number;
  if (period === "year") {
    end = Date.UTC(Number(key), 11, 31);
  } else if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    end = Date.UTC(y, m, 0); // 0. deň nasledujúceho mesiaca = posledný deň tohto
  } else {
    const [ys, ws] = key.split("-W");
    end = fromDayKey(weekRange(Number(ys), Number(ws))[1]).getTime();
  }
  return Math.max(0, Math.round((end - t) / dayMs) + 1);
}
