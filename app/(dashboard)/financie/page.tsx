"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Upload, Plus, Loader2, TrendingUp, TrendingDown, Search, X, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpendDonut, type DonutSlice } from "@/components/charts/SpendDonut";
import { formatCurrency } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLORS,
  type FinanceAccountDTO,
  type FinanceSummary,
  type FinanceTransactionDTO,
  type MonthlyTotal,
} from "@/lib/finance/types";

const CATEGORIES = [
  "Potraviny",
  "Jedlo & reštaurácie",
  "Predplatné",
  "Doprava",
  "Zdravie",
  "Oblečenie",
  "Zábava & šport",
  "Príjem z projektu",
  "Príjem",
  "Ostatné",
];

function catColor(cat: string): string {
  const i = CATEGORIES.indexOf(cat);
  return CATEGORY_COLORS[(i >= 0 ? i : cat.length) % CATEGORY_COLORS.length];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "balance" | "neutral";
  sub?: React.ReactNode;
}) {
  const color =
    tone === "income" ? "text-success" : tone === "expense" ? "text-danger" : tone === "balance" ? "text-primary" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{value}</p>
        {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function FinancePage() {
  const [accounts, setAccounts] = useState<FinanceAccountDTO[]>([]);
  const [account, setAccount] = useState("all");
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([]);
  const [txs, setTxs] = useState<FinanceTransactionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [fCategory, setFCategory] = useState("all");
  const [fType, setFType] = useState("all");
  const [q, setQ] = useState("");
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(async () => {
    const j = await fetch("/api/finance/accounts").then((r) => r.json());
    setAccounts(j.accounts ?? []);
  }, []);

  const loadSummary = useCallback(async () => {
    const [s, m] = await Promise.all([
      fetch(`/api/finance/summary?month=${month}&account=${account}`).then((r) => r.json()),
      fetch(`/api/finance/monthly?months=6&account=${account}`).then((r) => r.json()),
    ]);
    setSummary(s);
    setMonthly(m.monthly ?? []);
  }, [month, account]);

  const loadTxs = useCallback(async () => {
    const params = new URLSearchParams({ month, account, category: fCategory, type: fType });
    if (q.trim()) params.set("q", q.trim());
    const j = await fetch(`/api/finance/transactions?${params}`).then((r) => r.json());
    setTxs(j.transactions ?? []);
  }, [month, account, fCategory, fType, q]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSummary(), loadTxs()]).finally(() => setLoading(false));
  }, [loadSummary, loadTxs]);

  const donutData: DonutSlice[] = useMemo(
    () => (summary?.byCategory ?? []).map((c) => ({ label: c.category, value: c.amount, color: catColor(c.category) })),
    [summary],
  );

  const incomeDelta = summary ? summary.totalIncome - summary.vsLastMonth.income : 0;
  const expenseDelta = summary ? summary.totalExpenses - summary.vsLastMonth.expenses : 0;

  const onImport = async (file: File) => {
    setImporting(true);
    toast.loading("Importujem…", { id: "imp" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("account_id", account !== "all" ? account : "");
      const j = await fetch("/api/finance/import", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error) toast.error(j.error, { id: "imp" });
      else toast.success(`Importované: ${j.imported}${j.skipped ? ` · ${j.skipped} duplicít` : ""}`, { id: "imp" });
      loadMeta();
      loadSummary();
      loadTxs();
    } catch {
      toast.error("Import zlyhal", { id: "imp" });
    } finally {
      setImporting(false);
    }
  };

  const changeCategory = async (id: string, category: string) => {
    setEditCatId(null);
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
    await fetch(`/api/finance/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    loadSummary();
  };

  return (
    <div className="space-y-5">
      {/* Top controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Financie</h1>
          <p className="text-sm text-muted">Príjmy, výdavky a prehľad podľa kategórií.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Všetky účty</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECTION A — stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Príjmy tento mesiac" tone="income" value={formatCurrency(summary?.totalIncome ?? 0)} />
        <StatCard label="Výdavky tento mesiac" tone="expense" value={formatCurrency(summary?.totalExpenses ?? 0)} />
        <StatCard label="Zostatok" tone="balance" value={formatCurrency(summary?.balance ?? 0)} />
        <StatCard
          label="Vs. minulý mesiac"
          tone="neutral"
          value=""
          sub={
            summary && (
              <div className="space-y-0.5">
                <span className="flex items-center gap-1">
                  {incomeDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-danger" />}
                  Príjmy {incomeDelta >= 0 ? "+" : ""}
                  {formatCurrency(incomeDelta, true)}
                </span>
                <span className="flex items-center gap-1">
                  {expenseDelta <= 0 ? <TrendingDown className="h-3.5 w-3.5 text-success" /> : <TrendingUp className="h-3.5 w-3.5 text-danger" />}
                  Výdavky {expenseDelta >= 0 ? "+" : ""}
                  {formatCurrency(expenseDelta, true)}
                </span>
              </div>
            )
          }
        />
      </div>

      {/* SECTION B + C — charts + actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Výdavky podľa kategórií</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length ? (
              <SpendDonut data={donutData} centerLabel="Výdavky" />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Žiadne výdavky tento mesiac.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Príjmy vs. výdavky (6 mes.)</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={44} />
                  <RTooltip
                    formatter={(v: number, n: string) => [formatCurrency(v), n === "income" ? "Príjmy" : "Výdavky"]}
                    contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend formatter={(v) => (v === "income" ? "Príjmy" : "Výdavky")} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Import & akcie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted">
              Cieľový účet: <span className="text-foreground">{account === "all" ? "predvolený" : accounts.find((a) => a.id === account)?.name}</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
            <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importovať CSV (SLSP)
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Pridať manuálne
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* SECTION D — transactions */}
      <Card>
        <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Transakcie</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Hľadať…"
                className="h-9 w-40 rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground">
              <option value="all">Typ: všetko</option>
              <option value="income">Príjmy</option>
              <option value="expense">Výdavky</option>
            </select>
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground">
              <option value="all">Kategória: všetko</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Načítavam…
            </div>
          ) : txs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Žiadne transakcie. Importuj CSV alebo pridaj manuálne.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Dátum</th>
                    <th className="py-2 pr-3 font-medium">Popis</th>
                    <th className="py-2 pr-3 font-medium">Kategória</th>
                    <th className="py-2 pr-3 text-right font-medium">Suma</th>
                    <th className="py-2 font-medium">Účet</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-b border-border/60">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted">
                        {new Date(t.date).toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-foreground">{t.description}</td>
                      <td className="py-2 pr-3">
                        {editCatId === t.id ? (
                          <select
                            autoFocus
                            defaultValue={t.category}
                            onChange={(e) => changeCategory(t.id, e.target.value)}
                            onBlur={() => setEditCatId(null)}
                            className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditCatId(t.id)}
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ background: `${catColor(t.category)}22`, color: catColor(t.category) }}
                            title="Klikni pre zmenu kategórie"
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor(t.category) }} />
                            {t.category}
                          </button>
                        )}
                      </td>
                      <td className={cn("whitespace-nowrap py-2 pr-3 text-right font-medium tabular-nums", t.amount >= 0 ? "text-success" : "text-danger")}>
                        {t.amount >= 0 ? "+" : ""}
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="whitespace-nowrap py-2 text-xs text-muted">{t.accountName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <AddTransactionModal
          accounts={accounts}
          defaultAccount={account !== "all" ? account : accounts[0]?.id ?? ""}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            loadMeta();
            loadSummary();
            loadTxs();
          }}
        />
      )}
    </div>
  );
}

function AddTransactionModal({
  accounts,
  defaultAccount,
  onClose,
  onSaved,
}: {
  accounts: FinanceAccountDTO[];
  defaultAccount: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(defaultAccount);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<"expense" | "income">("expense");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Ostatné");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Math.abs(Number(amount.replace(",", ".")));
    if (!Number.isFinite(value) || value === 0) return toast.error("Zadaj sumu");
    setSaving(true);
    try {
      const signed = sign === "expense" ? -value : value;
      const j = await fetch("/api/finance/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, date, amount: signed, description, category, type: sign, source: "manual" }),
      }).then((r) => r.json());
      if (j.transaction) {
        toast.success("Transakcia pridaná");
        onSaved();
      } else {
        toast.error(j.error || "Uloženie zlyhalo");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Pridať transakciu</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSign("expense")}
              className={cn("rounded-lg border px-3 py-2 text-sm font-medium", sign === "expense" ? "border-danger bg-danger/10 text-danger" : "border-border text-muted")}
            >
              Výdavok
            </button>
            <button
              onClick={() => setSign("income")}
              className={cn("rounded-lg border px-3 py-2 text-sm font-medium", sign === "income" ? "border-success bg-success/10 text-success" : "border-border text-muted")}
            >
              Príjem
            </button>
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Suma (€)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Popis" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
            {accounts.length === 0 && <option value="">Predvolený účet</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Uložiť
          </Button>
        </div>
      </div>
    </div>
  );
}
