"use client";

import { Check, FileText, CalendarClock, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { METRIC_LIST } from "@/lib/metric-config";
import { googleCampaigns, metaCampaigns } from "@/lib/mock-data";
import {
  REPORT_TEMPLATES,
  getTemplate,
  type ReportConfig,
  type ReportTemplate,
} from "@/lib/report";
import type { Campaign, MetricKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const TEMPLATE_ICONS: Record<ReportTemplate, typeof FileText> = {
  weekly: CalendarClock,
  monthly: FileText,
  deepdive: FileBarChart,
};

const RANGE_OPTIONS = [7, 30, 60, 90] as const;

interface ReportBuilderProps {
  config: ReportConfig;
  onChange: (config: ReportConfig) => void;
}

export function ReportBuilder({ config, onChange }: ReportBuilderProps) {
  const selectTemplate = (id: ReportTemplate) => {
    const t = getTemplate(id);
    onChange({
      ...config,
      template: id,
      rangeDays: t.rangeDays,
      metrics: t.metrics,
      title:
        id === "weekly"
          ? "Týždenný súhrn kampaní"
          : id === "monthly"
            ? "Mesačný výkonnostný report"
            : "Hĺbková analýza kampaní",
    });
  };

  const toggleCampaign = (id: string) => {
    const has = config.campaignIds.includes(id);
    onChange({
      ...config,
      campaignIds: has
        ? config.campaignIds.filter((c) => c !== id)
        : [...config.campaignIds, id],
    });
  };

  const toggleMetric = (key: MetricKey) => {
    const has = config.metrics.includes(key);
    onChange({
      ...config,
      metrics: has ? config.metrics.filter((m) => m !== key) : [...config.metrics, key],
    });
  };

  const setAll = (ids: string[], on: boolean) => {
    const set = new Set(config.campaignIds);
    ids.forEach((id) => (on ? set.add(id) : set.delete(id)));
    onChange({ ...config, campaignIds: [...set] });
  };

  return (
    <div className="space-y-6">
      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Šablóna reportu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICONS[t.id];
            const active = config.template === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTemplate(t.id)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all cursor-pointer",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-surface-2/40 hover:border-primary/40",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    active ? "bg-primary text-white" : "bg-surface-2 text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted">{t.description}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Nastavenia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="report-title">Názov reportu</Label>
            <Input
              id="report-title"
              value={config.title}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Časový rozsah</Label>
            <Select
              value={String(config.rangeDays)}
              onValueChange={(v) => onChange({ ...config, rangeDays: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    Posledných {r} dní
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Metriky</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {METRIC_LIST.map((m) => {
            const active = config.metrics.includes(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface-2/40 text-muted hover:text-foreground",
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {m.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Campaign selection */}
      <Card>
        <CardHeader>
          <CardTitle>Kampane ({config.campaignIds.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <CampaignGroup
            label="Google Ads"
            campaigns={googleCampaigns}
            selected={config.campaignIds}
            onToggle={toggleCampaign}
            onSetAll={setAll}
          />
          <CampaignGroup
            label="Meta Ads"
            campaigns={metaCampaigns}
            selected={config.campaignIds}
            onToggle={toggleCampaign}
            onSetAll={setAll}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignGroup({
  label,
  campaigns,
  selected,
  onToggle,
  onSetAll,
}: {
  label: string;
  campaigns: Campaign[];
  selected: string[];
  onToggle: (id: string) => void;
  onSetAll: (ids: string[], on: boolean) => void;
}) {
  const ids = campaigns.map((c) => c.id);
  const allOn = ids.every((id) => selected.includes(id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <button
          onClick={() => onSetAll(ids, !allOn)}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          {allOn ? "Zrušiť výber" : "Vybrať všetky"}
        </button>
      </div>
      <div className="space-y-1.5">
        {campaigns.map((c) => {
          const active = selected.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onToggle(c.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer",
                active ? "border-primary/30 bg-primary/5" : "border-border bg-surface-2/30 hover:border-border",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  active ? "border-primary bg-primary text-white" : "border-border",
                )}
              >
                {active && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1 truncate text-sm text-foreground">{c.name}</span>
              <PlatformBadge platform={c.platform} showLabel={false} />
              <StatusBadge status={c.status} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
