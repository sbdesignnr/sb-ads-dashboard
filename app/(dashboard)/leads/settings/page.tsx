"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Plus,
  Play,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  RotateCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type SegmentDTO } from "@/lib/leads/types";

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#64748b",
];

interface JobRow {
  id: string;
  segmentName: string;
  status: string;
  foundTotal: number;
  foundQualified: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const JOB_STATUS: Record<string, { label: string; variant: "default" | "info" | "warning" | "success" | "danger" }> = {
  pending: { label: "Čaká", variant: "default" },
  running: { label: "Beží", variant: "info" },
  completed: { label: "Hotovo", variant: "success" },
  failed: { label: "Chyba", variant: "danger" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("sk-SK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110",
            value === c && "ring-2 ring-foreground",
          )}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function SegmentRow({
  seg,
  onSaved,
  onDeleted,
  onScan,
  scanning,
}: {
  seg: SegmentDTO;
  onSaved: (s: SegmentDTO) => void;
  onDeleted: (id: string) => void;
  onScan: (id: string) => void;
  scanning: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(seg.name);
  const [color, setColor] = useState(seg.color);
  const [keywords, setKeywords] = useState(seg.keywords.join(", "));
  const [comm, setComm] = useState(seg.communicationStyle ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/segments/${seg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          color,
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          communicationStyle: comm,
        }),
      });
      const j = await res.json();
      if (res.ok && j.segment) {
        onSaved(j.segment);
        setEditing(false);
        toast.success("Segment uložený");
      } else {
        toast.error(j.error || "Uloženie zlyhalo");
      }
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm(`Zmazať segment „${seg.name}"? Leady zostanú, ale bez segmentu.`)) return;
    const res = await fetch(`/api/leads/segments/${seg.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(seg.id);
      toast.success("Segment zmazaný");
    } else {
      toast.error("Zmazanie zlyhalo");
    }
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/40 bg-surface p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Názov segmentu"
        />
        <ColorPicker value={color} onChange={setColor} />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Kľúčové slová (oddelené čiarkou)"
        />
        <textarea
          value={comm}
          onChange={(e) => setComm(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Štýl komunikácie pre AI (napr. formálne a vecne pre advokátov / neformálne a energicky pre trénerov)"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Uložiť
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Zrušiť
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: seg.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{seg.name}</span>
          <span className="text-xs text-muted">{seg.leadCount} leadov</span>
        </div>
        {seg.keywords.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {seg.keywords.slice(0, 6).map((k) => (
              <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                {k}
              </span>
            ))}
            {seg.keywords.length > 6 && (
              <span className="text-xs text-muted">+{seg.keywords.length - 6}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onScan(seg.id)} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Scan teraz
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Upraviť">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={del} aria-label="Zmazať">
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </div>
  );
}

export default function LeadsSettingsPage() {
  const [segments, setSegments] = useState<SegmentDTO[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [region, setRegion] = useState<"SK" | "CZ" | "both">("both");

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newKeywords, setNewKeywords] = useState("");
  const [newComm, setNewComm] = useState("");
  const [creating, setCreating] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/jobs");
      const j = await res.json();
      setJobs(j.jobs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/leads/segments").then((r) => r.json()),
      fetch("/api/leads/jobs").then((r) => r.json()),
    ])
      .then(([s, j]) => {
        setSegments(s.segments ?? []);
        setJobs(j.jobs ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  // While a scan is running the API request is still in flight — poll the job
  // log so the found/qualified counts update live.
  useEffect(() => {
    if (!scanningId) return;
    const t = setInterval(loadJobs, 3000);
    return () => clearInterval(t);
  }, [scanningId, loadJobs]);

  const runningJob = jobs.find((j) => j.status === "running");

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/leads/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          keywords: newKeywords.split(",").map((k) => k.trim()).filter(Boolean),
          communicationStyle: newComm,
        }),
      });
      const j = await res.json();
      if (res.ok && j.segment) {
        setSegments((prev) => [...prev, j.segment]);
        setNewName("");
        setNewKeywords("");
        setNewComm("");
        setNewColor(PALETTE[0]);
        toast.success("Segment pridaný");
      } else {
        toast.error(j.error || "Pridanie zlyhalo");
      }
    } finally {
      setCreating(false);
    }
  };

  const runScan = async (segmentId: string) => {
    setScanningId(segmentId);
    toast.loading("Spúšťam scan…", { id: "scan" });
    try {
      const res = await fetch("/api/leads/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId, region }),
      });
      const j = await res.json();
      if (res.ok && j.status !== "failed") {
        toast.success(`Scan hotový — ${j.foundQualified ?? 0} nových leadov`, { id: "scan" });
      } else {
        toast.error(j.errorMessage || j.error || "Scan zlyhal", { id: "scan" });
      }
    } catch {
      toast.error("Scan zlyhal", { id: "scan" });
    } finally {
      setScanningId(null);
      loadJobs();
      // refresh segment counts
      fetch("/api/leads/segments")
        .then((r) => r.json())
        .then((s) => setSegments(s.segments ?? []))
        .catch(() => {});
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Späť
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nastavenia leadov</h1>
          <p className="text-sm text-muted">Spravuj segmenty a spúšťaj skenovanie.</p>
        </div>
      </div>

      {/* New segment */}
      <Card>
        <CardHeader>
          <CardTitle>Nový segment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Názov (napr. Kaviarne)"
            />
            <input
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Kľúčové slová (oddelené čiarkou)"
            />
          </div>
          <textarea
            value={newComm}
            onChange={(e) => setNewComm(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Štýl komunikácie pre AI (napr. formálne a vecne pre advokátov / neformálne a energicky pre trénerov) — nepovinné"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <Button size="sm" onClick={create} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Pridať segment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Segments */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Segmenty</h2>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
            {(["both", "SK", "CZ"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  region === r ? "bg-primary text-white" : "text-muted hover:text-foreground",
                )}
              >
                {r === "both" ? "SK + CZ" : r}
              </button>
            ))}
          </div>
        </div>

        {scanningId && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-foreground">Skenovanie beží…</span>
            {runningJob && (
              <span className="text-muted">
                nájdených {runningJob.foundTotal} · kvalifikovaných {runningJob.foundQualified}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Načítavam…
          </div>
        ) : segments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Zatiaľ žiadne segmenty.</p>
        ) : (
          segments.map((s) => (
            <SegmentRow
              key={s.id}
              seg={s}
              scanning={scanningId === s.id}
              onScan={runScan}
              onSaved={(u) => setSegments((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={(id) => setSegments((prev) => prev.filter((x) => x.id !== id))}
            />
          ))
        )}
      </div>

      {/* Scan jobs log */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Log skenovaní</CardTitle>
          <Button size="sm" variant="ghost" onClick={loadJobs} aria-label="Obnoviť">
            <RotateCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Žiadne skenovania.</p>
          ) : (
            <div className="space-y-1.5">
              {jobs.map((j) => {
                const st = JOB_STATUS[j.status] ?? { label: j.status, variant: "default" as const };
                return (
                  <div
                    key={j.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span className="font-medium text-foreground">{j.segmentName}</span>
                    <span className="text-muted">
                      {j.foundQualified}/{j.foundTotal} kvalifikovaných
                    </span>
                    <span className="ml-auto text-xs text-muted">{fmt(j.completedAt ?? j.createdAt)}</span>
                    {j.errorMessage && (
                      <span className="w-full text-xs text-danger">{j.errorMessage}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
