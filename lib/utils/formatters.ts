import type { CampaignStatus, CampaignType, Platform } from "@/lib/types";

const LOCALE = "sk-SK";

const currencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const currencyWholeFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function formatCurrency(value: number, whole = false): string {
  return (whole ? currencyWholeFmt : currencyFmt).format(value);
}

/** Compact currency: €1,2 tis. / €3,4 mil. */
export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)} mil.`;
  if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(1)} tis.`;
  return currencyWholeFmt.format(value);
}

export function formatNumber(value: number): string {
  return numberFmt.format(Math.round(value));
}

/** Compact number: 1,2k / 3,4M */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value);
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)} %`;
}

export function formatRoas(value: number): string {
  return `${value.toFixed(2)}×`;
}

export function formatDelta(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} %`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "numeric" });
}

export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDate(startIso)} – ${formatDate(endIso)}`;
}

/** Relative time in Slovak, e.g. "pred 3 hodinami". Client-side use. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "nikdy";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "pred chvíľou";
  if (min < 60) return `pred ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pred ${h} ${h === 1 ? "hodinou" : "hodinami"}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `pred ${d} ${d === 1 ? "dňom" : "dňami"}`;
  return formatDate(iso);
}

// --- Localized labels ---

const STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Aktívna",
  paused: "Pozastavená",
  learning: "Učí sa",
  limited: "Obmedzená",
  removed: "Odstránená",
};

export function statusLabel(status: CampaignStatus): string {
  return STATUS_LABELS[status];
}

const TYPE_LABELS: Record<CampaignType, string> = {
  search: "Search",
  display: "Display",
  shopping: "Shopping",
  awareness: "Awareness",
  traffic: "Traffic",
  conversion: "Conversion",
};

export function typeLabel(type: CampaignType): string {
  return TYPE_LABELS[type];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
};

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}
