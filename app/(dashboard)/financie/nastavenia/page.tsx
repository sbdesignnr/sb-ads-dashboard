"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Check, Loader2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { FinanceAccountDTO, FinanceBucketDTO, FinanceCategoryDTO } from "@/lib/finance/types";

const PALETTE = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#64748b"];

export default function FinanceSettingsPage() {
  const [accounts, setAccounts] = useState<FinanceAccountDTO[]>([]);
  const [buckets, setBuckets] = useState<FinanceBucketDTO[]>([]);
  const [categories, setCategories] = useState<FinanceCategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBucketName, setNewBucketName] = useState("");

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      fetch("/api/finance/accounts").then((r) => r.json()),
      fetch("/api/finance/buckets").then((r) => r.json()),
      fetch("/api/finance/categories").then((r) => r.json()),
    ]);
    setAccounts(a.accounts ?? []);
    setBuckets(b.buckets ?? []);
    setCategories((c.categories ?? []).filter((cat: FinanceCategoryDTO) => cat.isActive));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const percentSum = buckets.reduce((s, b) => s + b.percentage, 0);

  const setBudgetAccount = async (id: string) => {
    setAccounts((prev) => prev.map((a) => ({ ...a, isBudgetAccount: a.id === id })));
    await fetch(`/api/finance/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isBudgetAccount: true }),
    });
  };

  const updateBucket = async (id: string, patch: Partial<Pick<FinanceBucketDTO, "percentage" | "isPayBucket">>) => {
    setBuckets((prev) =>
      prev.map((b) => {
        if ("isPayBucket" in patch && patch.isPayBucket) return { ...b, isPayBucket: b.id === id };
        return b.id === id ? { ...b, ...patch } : b;
      }),
    );
    await fetch(`/api/finance/buckets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const deleteBucket = async (id: string) => {
    const res = await fetch(`/api/finance/buckets/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error === "has_categories" ? `Najprv preraď ${j.count} kategórií inam.` : "Zmazanie zlyhalo");
      return;
    }
    setBuckets((prev) => prev.filter((b) => b.id !== id));
  };

  const addBucket = async () => {
    const name = newBucketName.trim();
    if (!name) return;
    const color = PALETTE[buckets.length % PALETTE.length];
    const j = await fetch("/api/finance/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, percentage: 0, color }),
    }).then((r) => r.json());
    if (j.bucket) {
      setBuckets((prev) => [...prev, j.bucket]);
      setNewBucketName("");
    } else {
      toast.error(j.error || "Vytvorenie zlyhalo");
    }
  };

  const setCategoryBucket = async (id: string, bucketId: string | null) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, bucketId } : c)));
    await fetch(`/api/finance/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId }),
    });
  };

  const deactivateCategory = async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    const res = await fetch(`/api/finance/categories/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    toast.success(j.deleted ? "Kategória zmazaná" : "Kategória skrytá (má transakcie)");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/financie" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nastavenia financií</h1>
          <p className="text-sm text-muted">Podnikateľský účet, vrecká (Profit First) a kategórie.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Podnikateľský účet</CardTitle>
          <p className="text-xs text-muted">Z tohto účtu sa počítajú vrecká — ostatné účty (osobný a pod.) doň nevstupujú.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.length === 0 && <p className="text-sm text-muted">Zatiaľ žiadne účty.</p>}
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setBudgetAccount(a.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                a.isBudgetAccount ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-surface-2",
              )}
            >
              <Wallet className="h-4 w-4 shrink-0" />
              {a.name}
              <span className="text-xs text-muted">({a.type === "business" ? "podnikateľský" : "osobný"})</span>
              {a.isBudgetAccount && <Check className="ml-auto h-4 w-4" />}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vrecká</CardTitle>
          <p className={cn("text-xs", Math.round(percentSum) === 100 ? "text-muted" : "text-warning")}>
            Súčet percent: {percentSum}% {Math.round(percentSum) !== 100 && "— malo by dať spolu 100 %"}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {buckets.map((b) => (
            <div key={b.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                  <span className="text-sm font-medium text-foreground">{b.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateBucket(b.id, { isPayBucket: true })}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      b.isPayBucket ? "bg-primary text-white" : "border border-border text-muted hover:text-foreground",
                    )}
                    title="Vrecko, z ktorého sa počíta „bezpečné na minutie“"
                  >
                    {b.isPayBucket ? "Výplatné vrecko" : "Nastaviť ako výplatné"}
                  </button>
                  <button onClick={() => deleteBucket(b.id)} className="text-muted hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Slider
                  value={b.percentage}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => updateBucket(b.id, { percentage: v })}
                  className="flex-1"
                  aria-label={`Percento pre ${b.name}`}
                />
                <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">{b.percentage}%</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newBucketName}
              onChange={(e) => setNewBucketName(e.target.value)}
              placeholder="Názov nového vrecka"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button variant="secondary" onClick={addBucket}>
              <Plus className="h-4 w-4" />
              Pridať
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kategórie</CardTitle>
          <p className="text-xs text-muted">Každá kategória patrí do jedného vrecka — tam sa počíta jej výdavok.</p>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="flex-1 truncate text-sm text-foreground">{c.name}</span>
              {c.isIncome && <span className="text-[10px] uppercase tracking-wide text-success">príjem</span>}
              <select
                value={c.bucketId ?? ""}
                onChange={(e) => setCategoryBucket(c.id, e.target.value || null)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
              >
                <option value="">Nezaradené</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button onClick={() => deactivateCategory(c.id)} className="text-muted hover:text-danger" title="Odstrániť kategóriu">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
