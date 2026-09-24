"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSnapshots } from "@/lib/agents/registry";

/** Živý stav agentov z /api/agents/status (obnovuje sa každých 8 s, keď je karta viditeľná). */
export function useAgentStatus(intervalMs = 8000) {
  const [snapshots, setSnapshots] = useState<AgentSnapshots | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agents/status", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { agents: AgentSnapshots };
      if (!alive.current) return;
      setSnapshots(j.agents);
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "chyba");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, intervalMs]);

  return { snapshots, error, loadedAt, refresh: load };
}
