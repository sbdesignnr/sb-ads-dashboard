"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Target,
  Settings,
  Loader2,
  Globe,
  User,
  Phone,
  MapPin,
  Gauge,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type LeadDTO, type SegmentDTO, type LeadStatus, LEAD_STATUS_LABEL } from "@/lib/leads/types";

type StatusFilter = LeadStatus | "all";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "new", label: "Nové" },
  { value: "contacted", label: "Kontaktované" },
  { value: "converted", label: "Konvertované" },
  { value: "all", label: "Všetky" },
];

const STATUS_VARIANT: Record<LeadStatus, "default" | "info" | "warning" | "success" | "danger"> = {
  new: "info",
  contacted: "warning",
  converted: "success",
  rejected: "default",
};

function scoreClasses(score: number | null): string {
  if (score === null) return "bg-surface-2 text-muted";
  if (score >= 60) return "bg-danger/15 text-danger";
  if (score >= 40) return "bg-warning/15 text-warning";
  return "bg-success/15 text-success";
}

function host(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LeadsPage() {
  const [segments, setSegments] = useState<SegmentDTO[]>([]);
  const [leads, setLeads] = useState<LeadDTO[]>([]);
  const [segment, setSegment] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("new");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads/segments")
      .then((r) => r.json())
      .then((j) => setSegments(j.segments ?? []))
      .catch(() => {});
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?segment=${encodeURIComponent(segment)}&status=${status}`);
      const j = await res.json();
      setLeads(j.leads ?? []);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [segment, status]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const totalLeads = useMemo(() => segments.reduce((a, s) => a + s.leadCount, 0), [segments]);

  const SegmentBtn = ({ id, name, color, count, mobile }: { id: string; name: string; color?: string; count: number; mobile?: boolean }) => (
    <button
      onClick={() => setSegment(id)}
      className={cn(
        mobile
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
          : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
        segment === id
          ? mobile
            ? "border-primary/40 bg-primary/10 text-primary"
            : "bg-primary/10 text-primary"
          : mobile
            ? "border-border bg-surface text-muted hover:text-foreground"
            : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <Target className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 truncate">{name}</span>
      <span className="text-xs text-muted">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leady</h1>
          <p className="text-sm text-muted">Firmy so zastaralými webmi, pripravené na oslovenie.</p>
        </div>
        <Link
          href="/leads/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
        >
          <Settings className="h-4 w-4" />
          Nastavenia
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Segment sidebar (desktop) */}
        <aside className="hidden space-y-1 lg:block">
          <SegmentBtn id="all" name="Všetky segmenty" count={totalLeads} />
          {segments.map((s) => (
            <SegmentBtn key={s.id} id={s.id} name={s.name} color={s.color} count={s.leadCount} />
          ))}
        </aside>

        <div className="min-w-0">
          {/* Segment chips (mobile) */}
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
            <SegmentBtn id="all" name="Všetky" count={totalLeads} mobile />
            {segments.map((s) => (
              <SegmentBtn key={s.id} id={s.id} name={s.name} color={s.color} count={s.leadCount} mobile />
            ))}
          </div>

          {/* Status filter */}
          <div className="mb-4 inline-flex rounded-lg border border-border bg-surface-2 p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  status === t.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Načítavam leady…
            </div>
          ) : leads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Target className="h-6 w-6" />
                </div>
                <p className="max-w-md text-sm text-muted">
                  Žiadne leady. Spusti scan segmentu v nastaveniach — nájdeme firmy so zastaralými
                  webmi.
                </p>
                <Link
                  href="/leads/settings"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  <Settings className="h-4 w-4" />
                  Spustiť scan
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{l.companyName}</p>
                      {l.websiteUrl && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                          <Globe className="h-3 w-3" />
                          {host(l.websiteUrl)}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                        scoreClasses(l.websiteScore),
                      )}
                      title="Skóre zastaralosti webu"
                    >
                      {l.websiteScore ?? "—"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-muted">
                    {l.ownerName && (
                      <p className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        {l.ownerName}
                        {l.ownerPosition ? ` · ${l.ownerPosition}` : ""}
                      </p>
                    )}
                    {l.companyPhone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        {l.companyPhone}
                      </p>
                    )}
                    {l.companyCity && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {l.companyCity}
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                      {l.websiteTechnology && (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {l.websiteTechnology}
                        </span>
                      )}
                      {l.pageSpeedMobile != null && (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          PS {l.pageSpeedMobile}
                        </span>
                      )}
                    </p>
                  </div>

                  {l.aiPainPoint && (
                    <p className="line-clamp-2 rounded-lg bg-surface-2/60 px-2.5 py-2 text-xs leading-relaxed text-muted">
                      {l.aiPainPoint}
                    </p>
                  )}

                  <div className="mt-auto pt-1">
                    <Badge variant={STATUS_VARIANT[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
