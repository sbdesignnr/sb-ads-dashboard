"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Mail,
  MailOpen,
  MousePointerClick,
  Reply,
  RefreshCw,
  Loader2,
  Target,
  ExternalLink,
  Send,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  company: string;
  email: string | null;
  website: string | null;
  leadStatus: string;
  subject: string;
  sentAt: string | null;
  repliedAt: string | null;
  openCount: number;
  clickCount: number;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
}
interface MonthSummary {
  month: string;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}
interface Metrics {
  goal: number;
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  sent: {
    today: number;
    month: number;
    total: number;
  };
  funnel: {
    contacted: number;
    opened: number;
    clicked: number;
    replied: number;
  };
  series: { date: string; count: number }[];
  monthlySummary: MonthSummary[];
  lists: {
    allSent: Row[];
    replied: Row[];
    openedNotReplied: Row[];
    clicked: Row[];
  };
}

function shiftMonth(key: string, n: number): string {
  const [y, mo] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
function fmtDay(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(day)}.${Number(m)}.`;
}
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function FunnelStep({
  icon: Icon,
  label,
  value,
  pct,
  color,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  pct: number | null;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          color,
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {value}
            {pct !== null && (
              <span className="ml-1 text-xs font-normal text-muted">
                ({pct}%)
              </span>
            )}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary/70"
            style={{ width: `${pct ?? 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function RowList({
  rows,
  kind,
}: {
  rows: Row[];
  kind: "all" | "replied" | "opened" | "clicked";
}) {
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        {kind === "all"
          ? "V tomto mesiaci ešte nič nie je odoslané."
          : kind === "replied"
            ? "Zatiaľ nikto neodpovedal. Odpovede sa kontrolujú automaticky každé 2 hodiny."
            : kind === "opened"
              ? "Zatiaľ nikto neotvoril bez odpovede."
              : "Zatiaľ nikto neklikol na odkaz v maile."}
      </p>
    );
  }
  if (kind === "all") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-y-1 text-sm">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-44" />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-3 pb-1.5 font-medium">Firma</th>
              <th className="px-3 pb-1.5 font-medium">Odoslané</th>
              <th className="px-3 pb-1.5 font-medium">Otvorené</th>
              <th className="px-3 pb-1.5 font-medium">Odpovedal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="rounded-lg border border-border bg-surface">
                <td className="min-w-0 rounded-l-lg px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">{r.company}</span>
                    {r.website && (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted hover:text-primary"
                        title="Otvoriť web"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="min-w-0 truncate text-xs text-muted">{r.email ?? r.subject}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(r.sentAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {r.openCount > 0 ? (
                    <span className="text-warning">
                      👁 otvoril {r.openCount}× · {fmtDate(r.lastOpenedAt)}
                    </span>
                  ) : (
                    <span className="text-muted/70">neotvorené</span>
                  )}
                </td>
                <td className="rounded-r-lg whitespace-nowrap px-3 py-2 text-xs">
                  {r.repliedAt ? (
                    <span className="font-medium text-success">↩ odpovedal {fmtDate(r.repliedAt)}</span>
                  ) : (
                    <span className="text-muted/70">bez odpovede</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {r.company}
              </span>
              {r.website && (
                <a
                  href={r.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted hover:text-primary"
                  title="Otvoriť web"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="truncate text-xs text-muted">
              {r.email ?? r.subject}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            {kind === "replied" && (
              <span className="text-success">
                odpovedal {fmtDate(r.repliedAt)}
              </span>
            )}
            {kind === "opened" && (
              <span>
                👁 {r.openCount}× · {fmtDate(r.lastOpenedAt)}
                {r.clickCount > 0 && (
                  <span className="text-success"> · 👆 {r.clickCount}×</span>
                )}
              </span>
            )}
            {kind === "clicked" && (
              <span className="text-success">
                👆 {r.clickCount}× · {fmtDate(r.lastClickedAt)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (month?: string) => {
    try {
      const url = month
        ? `/api/leads/metrics?month=${encodeURIComponent(month)}`
        : "/api/leads/metrics";
      const j = await fetch(url, { cache: "no-store" }).then((r) => r.json());
      if (j.sent) setM(j);
    } catch {
      toast.error("Metriky sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checkReplies = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/cron/detect-replies", {
        method: "POST",
      }).then((x) => x.json());
      if (r.configured === false)
        toast.error("Chýba prístup k schránke (IMAP).");
      else
        toast.success(
          r.newReplies > 0
            ? `Nájdené nové odpovede: ${r.newReplies}`
            : "Žiadne nové odpovede.",
        );
      await load(m?.month);
    } catch {
      toast.error("Kontrola odpovedí zlyhala.");
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;
  }
  if (!m) {
    return <p className="text-sm text-muted">Metriky nie sú dostupné.</p>;
  }

  const goalPct = Math.min(100, Math.round((m.sent.month / m.goal) * 100));
  const now = new Date();
  const daysInSelectedMonth = m.series.length;
  const daysLeft = m.isCurrentMonth ? daysInSelectedMonth - now.getDate() + 1 : 0;
  const remaining = Math.max(0, m.goal - m.sent.month);
  const perDayNeeded =
    daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;

  const rate = (n: number) =>
    m.funnel.contacted ? Math.round((n / m.funnel.contacted) * 100) : null;
  const maxBar = Math.max(1, ...m.series.map((s) => s.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Metriky &amp; výsledky
            </h1>
            <p className="text-sm text-muted">
              Koľko oslovujem a čo to prináša.
            </p>
          </div>
        </div>
        <button
          onClick={checkReplies}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Skontrolovať odpovede
        </button>
      </div>

      {/* Prepínač mesiacov */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => load(shiftMonth(m.month, -1))}
          disabled={!m.hasPrev}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground disabled:opacity-30"
          title="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[11rem] text-center text-sm font-medium text-foreground">
          {capitalize(m.monthLabel)}
          {m.isCurrentMonth && (
            <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-normal text-primary">
              aktuálny
            </span>
          )}
        </span>
        <button
          onClick={() => load(shiftMonth(m.month, 1))}
          disabled={!m.hasNext}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground disabled:opacity-30"
          title="Nasledujúci mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Cieľ 150/mesiac */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">
                Mesačný cieľ: {m.goal} oslovených
              </span>
            </div>
            <span className="text-sm text-muted">
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {m.sent.month}
              </span>{" "}
              / {m.goal}
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                goalPct >= 100 ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {!m.isCurrentMonth ? (
              remaining === 0 ? (
                <span className="text-success">Cieľ v tomto mesiaci bol splnený.</span>
              ) : (
                <>Tento mesiac chýbalo do cieľa {remaining} mailov.</>
              )
            ) : remaining === 0 ? (
              <span className="text-success">Cieľ splnený! 🎉</span>
            ) : (
              <>
                Zostáva <strong className="text-foreground">{remaining}</strong>{" "}
                za <strong className="text-foreground">{daysLeft}</strong> dní —
                to je{" "}
                <strong className="text-foreground">{perDayNeeded}</strong>{" "}
                mailov na deň.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Koľko som poslal */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Koľko som poslal
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {m.isCurrentMonth && <StatTile label="Dnes" value={m.sent.today} />}
          <StatTile label={capitalize(m.monthLabel)} value={m.sent.month} />
          <StatTile label="Celkovo (všetky mesiace)" value={m.sent.total} />
        </div>
      </div>

      {/* Graf za vybraný mesiac */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Odoslané maily — {m.monthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={m.series}
              margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1E2D45"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fill: "#94A3B8", fontSize: 10 }}
                axisLine={{ stroke: "#1E2D45" }}
                tickLine={false}
                minTickGap={18}
                dy={6}
              />
              <YAxis
                tick={{ fill: "#94A3B8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(59,130,246,0.06)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-xl backdrop-blur">
                      <p className="text-xs text-muted">
                        {fmtDate(String(label))}
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {payload[0].value} mailov
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              />
            </BarChart>
          </ResponsiveContainer>
          {maxBar === 1 && m.series.every((s) => s.count === 0) && (
            <p className="mt-2 text-center text-xs text-muted">
              V tomto mesiaci žiadne odoslané maily.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lievik výsledkov */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Čo to prinieslo — {m.monthLabel} (unikátne firmy)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FunnelStep
            icon={Send}
            label="Oslovených firiem"
            value={m.funnel.contacted}
            pct={null}
            color="bg-primary/15 text-primary"
          />
          <FunnelStep
            icon={MailOpen}
            label="Otvorili email"
            value={m.funnel.opened}
            pct={rate(m.funnel.opened)}
            color="bg-warning/15 text-warning"
          />
          <FunnelStep
            icon={MousePointerClick}
            label="Klikli na odkaz"
            value={m.funnel.clicked}
            pct={rate(m.funnel.clicked)}
            color="bg-secondary/15 text-secondary"
          />
          <FunnelStep
            icon={Reply}
            label="Odpovedali"
            value={m.funnel.replied}
            pct={rate(m.funnel.replied)}
            color="bg-success/15 text-success"
          />
        </CardContent>
      </Card>

      {/* Porovnanie mesiacov */}
      {m.monthlySummary.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Porovnanie mesiacov</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 pb-1.5 font-medium">Mesiac</th>
                    <th className="px-2 pb-1.5 font-medium text-right">Odoslané</th>
                    <th className="px-2 pb-1.5 font-medium text-right">Otvorili</th>
                    <th className="px-2 pb-1.5 font-medium text-right">Klikli</th>
                    <th className="px-2 pb-1.5 font-medium text-right">Odpovedali</th>
                  </tr>
                </thead>
                <tbody>
                  {m.monthlySummary.map((row) => (
                    <tr
                      key={row.month}
                      onClick={() => row.month !== m.month && load(row.month)}
                      className={cn(
                        "cursor-pointer rounded-lg transition-colors",
                        row.month === m.month
                          ? "bg-primary/10"
                          : "hover:bg-surface-2",
                      )}
                    >
                      <td className="px-2 py-1.5 font-medium text-foreground">
                        {capitalize(row.label)}
                        {row.month === m.month && (
                          <span className="ml-1.5 text-primary">●</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                        {row.sent}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                        {row.opened}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                        {row.clicked}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-success">
                        {row.replied}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zoznamy */}
      <Card>
        <CardContent className="pt-5">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                <Send className="mr-1.5 h-4 w-4" />
                Všetky odoslané ({m.lists.allSent.length})
              </TabsTrigger>
              <TabsTrigger value="replied">
                <Reply className="mr-1.5 h-4 w-4" />
                Odpovedali ({m.lists.replied.length})
              </TabsTrigger>
              <TabsTrigger value="opened">
                <MailOpen className="mr-1.5 h-4 w-4" />
                Otvorili, neodpovedali ({m.lists.openedNotReplied.length})
              </TabsTrigger>
              <TabsTrigger value="clicked">
                <MousePointerClick className="mr-1.5 h-4 w-4" />
                Klikli ({m.lists.clicked.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <RowList rows={m.lists.allSent} kind="all" />
            </TabsContent>
            <TabsContent value="replied" className="mt-4">
              <RowList rows={m.lists.replied} kind="replied" />
            </TabsContent>
            <TabsContent value="opened" className="mt-4">
              <RowList rows={m.lists.openedNotReplied} kind="opened" />
            </TabsContent>
            <TabsContent value="clicked" className="mt-4">
              <RowList rows={m.lists.clicked} kind="clicked" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
