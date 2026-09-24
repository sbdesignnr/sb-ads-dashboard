"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Loader2, Pause, Play, Square } from "lucide-react";
import {
  getAnalysisRunState,
  getServerAnalysisRunState,
  startAnalysis,
  stopAnalysis,
  storedRunFor,
  subscribeAnalysisRun,
} from "@/lib/leads/analysis-runner";

interface Progress {
  remaining: number;
  doneSince: number | null;
  qualifiedSince: number | null;
}

function formatEta(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

/**
 * Ukazovateľ analýzy webov: "X z Y hotových, zostáva Z, z toho N vhodných".
 * Čísla sa berú z DB (nie z pamäte stránky), takže po prechode na detail leadu
 * a späť (aj po reloade) ukazujú skutočný stav. Viditeľný, kým sú nejaké leady
 * nezanalyzované alebo beh ešte prebieha.
 */
export function AnalysisProgress({
  segment,
  onRefresh,
}: {
  /** id segmentu alebo "all" */
  segment: string;
  /** obnoví zoznam leadov / počty (volá sa priebežne počas behu a po skončení) */
  onRefresh: () => void;
}) {
  const run = useSyncExternalStore(
    subscribeAnalysisRun,
    getAnalysisRunState,
    getServerAnalysisRunState,
  );
  const [p, setP] = useState<Progress | null>(null);
  const lastRefresh = useRef(Date.now());
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ segment });
      const stored = storedRunFor(segment);
      if (stored) qs.set("since", stored.since);
      const j = await fetch(`/api/leads/analyze-bulk?${qs}`).then((r) =>
        r.json(),
      );
      if (typeof j.remaining === "number")
        setP({
          remaining: j.remaining,
          doneSince: j.doneSince ?? null,
          qualifiedSince: j.qualifiedSince ?? null,
        });
    } catch {
      /* ponechaj posledné známe čísla */
    }
  }, [segment]);

  // Pri načítaní, zmene segmentu a po každej dokončenej dávke.
  useEffect(() => {
    load();
  }, [load, run.doneInRun, run.running]);

  // Počas behu priebežne dopytuj server a raz za ~30 s obnov zoznam leadov.
  useEffect(() => {
    if (!run.running) return;
    const t = setInterval(() => {
      load();
      if (Date.now() - lastRefresh.current > 30_000) {
        lastRefresh.current = Date.now();
        onRefresh();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [run.running, load, onRefresh]);

  // Keď beh skončí, obnov zoznam (nové skóre, počty v segmentoch).
  useEffect(() => {
    if (wasRunning.current && !run.running) onRefresh();
    wasRunning.current = run.running;
  }, [run.running, onRefresh]);

  if (!p) return null;
  if (!run.running && p.remaining === 0) return null;

  const total = p.doneSince !== null ? p.doneSince + p.remaining : null;
  const pct =
    total && p.doneSince !== null
      ? Math.min(100, Math.round((p.doneSince / total) * 100))
      : null;
  const eta =
    run.running && run.startedAt && run.doneInRun >= 6
      ? formatEta(
          ((Date.now() - run.startedAt) / run.doneInRun) * p.remaining,
        )
      : null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
          {run.running ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Pause className="h-4 w-4 text-muted" />
          )}
          {run.running ? "Analýza webov beží" : "Analýza webov je pozastavená"}
          <span className="text-xs font-normal text-muted">
            {run.running
              ? "— môžeš prechádzať appku, beh pokračuje (nezatváraj kartu)"
              : "— nič sa nestratilo, môžeš pokračovať"}
          </span>
        </div>
        {run.running ? (
          <button
            onClick={stopAnalysis}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            <Square className="h-3.5 w-3.5" />
            Zastaviť
          </button>
        ) : (
          <button
            onClick={() => startAnalysis(segment)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <Play className="h-3.5 w-3.5" />
            Pokračovať
          </button>
        )}
      </div>

      {pct !== null && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        {total !== null && p.doneSince !== null ? (
          <>
            <span className="font-semibold text-foreground">{p.doneSince}</span>{" "}
            z <span className="font-semibold text-foreground">{total}</span>{" "}
            hotových ({pct} %) · zostáva{" "}
            <span className="font-semibold text-foreground">{p.remaining}</span>
          </>
        ) : (
          <>
            Zostáva{" "}
            <span className="font-semibold text-foreground">{p.remaining}</span>{" "}
            webov na analýzu
          </>
        )}
        {p.qualifiedSince !== null && p.doneSince ? (
          <>
            {" "}
            · z hotových vhodných na oslovenie:{" "}
            <span className="font-semibold text-foreground">
              {p.qualifiedSince}
            </span>
          </>
        ) : null}
        {eta ? <> · zostáva {eta}</> : null}
      </p>
    </div>
  );
}
