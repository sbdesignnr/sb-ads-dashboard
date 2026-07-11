"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2,
  Play,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SeoTask {
  id: string;
  pillar: string;
  title: string;
  why: string;
  steps: string[];
  codeSnippet: string | null;
  targetUrl: string | null;
  effortMin: number;
  impact: number;
  priority: number;
  status: string;
  doneSteps: number[];
  metric: string | null;
  expectedNote: string | null;
  verifyAfterDays: number;
  baselineValue: number | null;
  actualValue: number | null;
  verdict: string | null;
  verdictNote: string | null;
  verifyAt: string | null;
}

interface Overview {
  site: { domain: string; url: string; gscProperty: string | null };
  audit: { score: number; pillarScores: Record<string, number>; pagesCrawled: number; completedAt: string | null } | null;
  tasks: SeoTask[];
  gsc: { ok: boolean; serviceAccount: string | null; message?: string; reason?: string };
}

const PILLAR_LABEL: Record<string, string> = {
  technical: "Technické",
  onpage: "On-page",
  content: "Obsah",
  authority: "Autorita",
  local: "Lokálne",
};

const scoreColor = (s: number) => (s >= 85 ? "text-success" : s >= 60 ? "text-warning" : "text-danger");

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-border" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          strokeWidth="7"
          strokeLinecap="round"
          className={cn("fill-none transition-all duration-700", scoreColor(score))}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold", scoreColor(score))}>{score}</span>
        <span className="text-[10px] text-muted">/ 100</span>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onStatus,
  onToggleStep,
}: {
  task: SeoTask;
  onStatus: (id: string, s: string) => void;
  onToggleStep: (id: string, index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doneSet = new Set(task.doneSteps ?? []);
  const stepsDone = task.steps.filter((_, i) => doneSet.has(i)).length;
  const allDone = task.steps.length > 0 && stepsDone === task.steps.length;
  const locked = task.status === "done" || task.status === "verified";

  const act = async (s: string) => {
    setBusy(true);
    try {
      await onStatus(task.id, s);
    } finally {
      setBusy(false);
    }
  };

  const verdictIcon =
    task.verdict === "improved" ? (
      <TrendingUp className="h-4 w-4 text-success" />
    ) : task.verdict === "worse" ? (
      <TrendingDown className="h-4 w-4 text-danger" />
    ) : (
      <Minus className="h-4 w-4 text-muted" />
    );

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{PILLAR_LABEL[task.pillar] ?? task.pillar}</Badge>
            <span className="font-medium text-foreground">{task.title}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Priorita {task.priority} · dopad {task.impact}/5 · {task.effortMin} min
            {task.metric && ` · meria sa cez ${task.metric}`}
          </p>
          {!locked && stepsDone > 0 && (
            <p className={cn("mt-1 text-xs font-medium", allDone ? "text-success" : "text-primary")}>
              Krok {stepsDone}/{task.steps.length}
              {allDone ? " — hotovo, môžeš dať Hotovo ✓" : " rozpracované"}
            </p>
          )}
          {task.verdictNote && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-foreground">
              {verdictIcon}
              {task.verdictNote}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Prečo na tom záleží</p>
            <p className="text-foreground">{task.why}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Presné kroky — odškrtávaj postupne</p>
              <span className={cn("text-xs font-medium", allDone ? "text-success" : "text-muted")}>
                {stepsDone}/{task.steps.length} hotových
              </span>
            </div>
            {/* Progress bar */}
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn("h-full rounded-full transition-all", allDone ? "bg-success" : "bg-primary")}
                style={{ width: `${task.steps.length ? (stepsDone / task.steps.length) * 100 : 0}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {task.steps.map((s, i) => {
                const checked = doneSet.has(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onToggleStep(task.id, i)}
                      disabled={locked}
                      className="flex w-full items-start gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-2/60 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          checked ? "border-success bg-success text-white" : "border-border bg-surface",
                        )}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className={cn("text-sm", checked ? "text-muted line-through" : "text-foreground")}>{s}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {task.codeSnippet && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Hotový kód</p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs text-foreground">
                <code>{task.codeSnippet}</code>
              </pre>
            </div>
          )}

          {task.expectedNote && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
              <p className="text-xs font-medium text-primary">Očakávaný výsledok</p>
              <p className="text-foreground">{task.expectedNote}</p>
              <p className="mt-1 text-xs text-muted">Overím automaticky o {task.verifyAfterDays} dní po označení „Hotovo“.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {task.targetUrl && (
              <a
                href={task.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Otvoriť stránku
              </a>
            )}
            <div className="ml-auto flex items-center gap-2">
              {allDone && (task.status === "todo" || task.status === "doing") && (
                <span className="hidden text-xs text-success sm:inline">Všetky kroky hotové 🎉</span>
              )}
              {(task.status === "todo" || task.status === "doing") && (
                <>
                  <Button
                    size="sm"
                    variant={allDone ? "default" : "secondary"}
                    onClick={() => act("done")}
                    disabled={busy}
                    title={allDone ? "Odfotím baseline a o pár týždňov premeriam výsledok" : "Označ ako hotové (baseline sa odfotí)"}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Hotovo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act("dismissed")} disabled={busy} title="Skryť túto úlohu">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {task.status === "done" && <Badge variant="info">Čaká na overenie</Badge>}
              {task.status === "verified" && (
                <Badge variant={task.verdict === "improved" ? "success" : task.verdict === "worse" ? "danger" : "default"}>
                  Overené
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SeoPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/seo");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const runAudit = async () => {
    setAuditing(true);
    toast.loading("Spúšťam audit…", { id: "seo" });
    try {
      const res = await fetch("/api/seo/audit", { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        toast.success(`Audit hotový — skóre ${j.score}/100, ${j.tasksOpen} otvorených úloh`, { id: "seo", duration: 6000 });
        await load();
      } else {
        toast.error(j.error || "Audit zlyhal", { id: "seo" });
      }
    } finally {
      setAuditing(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await fetch(`/api/seo/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (status === "done") toast.success("Označené ako hotové — baseline odfotený, výsledok overím automaticky");
    await load();
  };

  // Optimistic step toggle — flip locally right away so the checkbox feels instant,
  // then persist and reconcile with the server.
  const toggleStep = async (id: string, index: number) => {
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        tasks: d.tasks.map((t) => {
          if (t.id !== id) return t;
          const set = new Set(t.doneSteps ?? []);
          set.has(index) ? set.delete(index) : set.add(index);
          const doneSteps = [...set].sort((a, b) => a - b);
          const status = t.status === "todo" && doneSteps.length > 0 ? "doing" : t.status;
          return { ...t, doneSteps, status };
        }),
      };
    });
    await fetch(`/api/seo/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toggleStep: index }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }
  if (!data) return <p className="py-10 text-center text-sm text-muted">Nepodarilo sa načítať SEO dáta.</p>;

  const open = data.tasks.filter((t) => t.status === "todo" || t.status === "doing");
  const awaiting = data.tasks.filter((t) => t.status === "done");
  const verified = data.tasks.filter((t) => t.status === "verified");
  const thisWeek = open.slice(0, 3);
  const totalHours = Math.round(open.reduce((s, t) => s + t.effortMin, 0) / 60);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">SEO</h1>
          <p className="text-sm text-muted">
            {data.site.domain}
            {data.audit?.completedAt && ` · posledný audit ${new Date(data.audit.completedAt).toLocaleDateString("sk-SK")}`}
          </p>
        </div>
        <Button size="sm" onClick={runAudit} disabled={auditing}>
          {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Spustiť audit
        </Button>
      </div>

      {!data.gsc.ok && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">Search Console nie je pripojené — chýbajú pozície a CTR</p>
            <p className="mt-0.5 text-muted">{data.gsc.message}</p>
            {data.gsc.serviceAccount && (
              <p className="mt-1 break-all text-xs text-muted">
                Pridaj tento service account do Search Console ako používateľa:{" "}
                <span className="text-foreground">{data.gsc.serviceAccount}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {data.audit && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 pt-6">
            <ScoreRing score={data.audit.score} />
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {Object.entries(data.audit.pillarScores ?? {}).map(([p, s]) => (
                <div key={p}>
                  <p className="text-xs text-muted">{PILLAR_LABEL[p] ?? p}</p>
                  <p className={cn("text-lg font-semibold", scoreColor(s))}>{s}</p>
                </div>
              ))}
            </div>
            <div className="text-right text-xs text-muted">
              <p>{data.audit.pagesCrawled} stránok</p>
              <p>{open.length} otvorených úloh</p>
              <p>~{totalHours} h práce</p>
            </div>
          </CardContent>
        </Card>
      )}

      {thisWeek.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Čo spraviť tento týždeň</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {thisWeek.map((t) => (
              <TaskCard key={t.id} task={t} onStatus={setStatus} onToggleStep={toggleStep} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Všetky úlohy ({open.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {open.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Žiadne otvorené úlohy. Spusti audit.</p>
          ) : (
            open.map((t) => <TaskCard key={t.id} task={t} onStatus={setStatus} onToggleStep={toggleStep} />)
          )}
        </CardContent>
      </Card>

      {awaiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Čaká na overenie ({awaiting.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {awaiting.map((t) => (
              <TaskCard key={t.id} task={t} onStatus={setStatus} onToggleStep={toggleStep} />
            ))}
          </CardContent>
        </Card>
      )}

      {verified.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Overené výsledky ({verified.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {verified.map((t) => (
              <TaskCard key={t.id} task={t} onStatus={setStatus} onToggleStep={toggleStep} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
