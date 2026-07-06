"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mic, Loader2, Volume2, AlertTriangle } from "lucide-react";
import { useJarvis, type JarvisState } from "./useJarvis";

interface Stats {
  leadsToday: number;
  emailsSent: number;
  googleAdsSpend: number | null;
  projectsCount: number;
}

const STATE_TEXT: Record<JarvisState, string> = {
  idle: "Čakám...",
  listening: "Počúvam...",
  thinking: "Premýšľam...",
  speaking: "Hovorím...",
  error: "Chyba",
};

const STATE_COLOR: Record<JarvisState, string> = {
  idle: "#4A90D9",
  listening: "#ef4444",
  thinking: "#4A90D9",
  speaking: "#22c55e",
  error: "#ef4444",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 backdrop-blur-sm">
      <div className="text-3xl font-bold tabular-nums text-[#4A90D9]">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-neutral-400">{label}</div>
    </div>
  );
}

function Waveform() {
  return (
    <div className="mt-8 flex h-12 items-center justify-center gap-1">
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-[#4A90D9]"
          style={{
            height: "100%",
            transformOrigin: "center",
            animation: `jarvis-wave ${0.6 + (i % 5) * 0.12}s ease-in-out ${i * 0.05}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function JarvisCommandCenter() {
  const router = useRouter();
  const { state, transcript, response, errorMsg, toggle } = useJarvis();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/jarvis/stats")
        .then((r) => r.json())
        .then((j) => active && setStats(j))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const back = useCallback(() => router.push("/"), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const color = STATE_COLOR[state];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black text-white">
      <style>{`
        @keyframes jarvis-wave { 0%,100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
        @keyframes jarvis-pulse-slow { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.06); } }
      `}</style>

      {/* Corner stats */}
      <div className="absolute left-5 top-5">
        <StatCard label="Leady dnes" value={stats ? String(stats.leadsToday) : "--"} />
      </div>
      <div className="absolute right-5 top-5 flex flex-col items-end gap-3">
        <button
          onClick={back}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        <StatCard label="Emailov odoslaných" value={stats ? String(stats.emailsSent) : "--"} />
      </div>
      <div className="absolute bottom-5 left-5">
        <StatCard
          label="Google Ads (mesiac)"
          value={stats && stats.googleAdsSpend != null ? `${stats.googleAdsSpend.toFixed(0)}€` : "--"}
        />
      </div>
      <div className="absolute bottom-5 right-5">
        <StatCard label="Projekty" value={stats ? String(stats.projectsCount) : "--"} />
      </div>

      {/* Transcript bubble (above the orb) */}
      <div className="mb-8 flex h-10 items-end">
        {transcript && <p className="max-w-[420px] text-center text-neutral-400">{transcript}</p>}
      </div>

      {/* Central orb */}
      <button
        onClick={toggle}
        aria-label="Jarvis"
        className="relative flex h-[200px] w-[200px] items-center justify-center rounded-full focus:outline-none"
      >
        {/* outer glow */}
        <span
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: color,
            opacity: 0.25,
            animation: state === "idle" ? "jarvis-pulse-slow 3s ease-in-out infinite" : undefined,
          }}
        />
        {/* listening ping */}
        {state === "listening" && (
          <span className="absolute inset-0 rounded-full" style={{ background: color, opacity: 0.2, animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite" }} />
        )}
        {/* thinking rotating gradient */}
        {state === "thinking" && (
          <span
            className="absolute inset-0 animate-spin rounded-full"
            style={{ background: `conic-gradient(from 0deg, ${color}, transparent 55%, ${color})`, animationDuration: "1.6s" }}
          />
        )}
        {/* body */}
        <span
          className="absolute inset-[10px] rounded-full border-2 bg-black transition-all"
          style={{ borderColor: color, boxShadow: `0 0 70px ${color}55, inset 0 0 40px ${color}22` }}
        />
        {/* center icon */}
        <span className="relative z-10">
          {state === "thinking" ? (
            <Loader2 className="h-14 w-14 animate-spin" style={{ color }} />
          ) : state === "speaking" ? (
            <Volume2 className="h-14 w-14" style={{ color }} />
          ) : state === "error" ? (
            <AlertTriangle className="h-14 w-14" style={{ color }} />
          ) : (
            <Mic className="h-14 w-14" style={{ color }} />
          )}
        </span>
      </button>

      {/* State text */}
      <p className="mt-8 text-2xl font-semibold tracking-tight" style={{ color }}>
        {STATE_TEXT[state]}
      </p>

      {/* Waveform while speaking */}
      {state === "speaking" && <Waveform />}

      {/* Response bubble */}
      <div className="mt-6 flex min-h-[3rem] items-start px-4">
        {errorMsg ? (
          <p className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </p>
        ) : (
          response && <p className="max-w-[400px] text-center text-lg leading-relaxed text-white">{response}</p>
        )}
      </div>

      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-neutral-600">
        Klikni na kruh alebo stlač Cmd/Ctrl+Shift+J · ESC pre návrat
      </p>
    </div>
  );
}
