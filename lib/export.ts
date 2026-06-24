import type { ReportData } from "@/lib/report";
import { METRICS } from "@/lib/metric-config";
import { platformLabel, statusLabel } from "@/lib/utils/formatters";
import type { MetricKey } from "@/lib/types";

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function numeric(value: number, key: MetricKey): string {
  const isRatio = key === "ctr" || key === "conversionRate" || key === "roas";
  const isMoney = key === "spend" || key === "revenue" || key === "cpc" || key === "cpm";
  if (isRatio || isMoney) return value.toFixed(2);
  return Math.round(value).toString();
}

export function buildReportCsv(data: ReportData): string {
  const cols = data.config.metrics;
  const rows: string[][] = [];

  rows.push(["Kampaň", "Platforma", "Status", ...cols.map((c) => METRICS[c].label)]);

  for (const row of data.rows) {
    rows.push([
      row.campaign.name,
      platformLabel(row.campaign.platform),
      statusLabel(row.campaign.status),
      ...cols.map((c) => numeric(row.totals[c], c)),
    ]);
  }

  rows.push(["SPOLU", "", "", ...cols.map((c) => numeric(data.account[c], c))]);

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Trigger a client-side file download. Must be called in the browser. */
export function downloadFile(filename: string, content: BlobPart, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel reads UTF-8 correctly.
  downloadFile(filename, "﻿" + csv, "text/csv;charset=utf-8");
}

/** Copy text to the clipboard with a legacy fallback. Browser-only. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}
