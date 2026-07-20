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
interface Metrics {
  goal: number;
  sent: {
    today: number;
    week: number;
    month: number;
    year: number;
    total: number;
  };
  funnel: {
    contacted: number;
    opened: number;
    clicked: number;
    replied: number;
  };
  series: { date: string; count: number }[];
  lists: { replied: Row[]; openedNotReplied: Row[]; clicked: Row[] };
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
  kind: "replied" | "opened" | "clicked";
}) {
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        {kind === "replied"
          ? "Zatiaľ nikto neodpovedal. Odpovede sa kontrolujú automaticky každé 2 hodiny."
          : kind === "opened"
            ? "Zatiaľ nikto neotvoril bez odpovede."
            : "Zatiaľ nikto neklikol na odkaz v maile."}
      </p>
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

  const load = useCallback(async () => {
    try {
      const j = await fetch("/api/leads/metrics", { cache: "no-store" }).then(
        (r) => r.json(),
      );
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
      await load();
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
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
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
            {remaining === 0 ? (
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Dnes" value={m.sent.today} />
          <StatTile label="Tento týždeň" value={m.sent.week} />
          <StatTile label="Tento mesiac" value={m.sent.month} />
          <StatTile label="Tento rok" value={m.sent.year} />
          <StatTile label="Celkovo" value={m.sent.total} />
        </div>
      </div>

      {/* Graf za 30 dní */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Odoslané maily za posledných 30 dní
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
              Za posledných 30 dní žiadne odoslané maily.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lievik výsledkov */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Čo to prinieslo (unikátne firmy)
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

      {/* Zoznamy */}
      <Card>
        <CardContent className="pt-5">
          <Tabs defaultValue="replied">
            <TabsList>
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
