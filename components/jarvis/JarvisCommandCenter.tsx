"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  idle: "STANDBY",
  listening: "POČÚVAM",
  thinking: "PREMÝŠĽAM",
  speaking: "HOVORÍM",
  error: "CHYBA",
};

const STATE_COLOR: Record<JarvisState, string> = {
  idle: "#4A90D9",
  listening: "#ef4444",
  thinking: "#7B61FF",
  speaking: "#22c55e",
  error: "#ef4444",
};

// Hero-Patterns "Hexagons" — a subtle honeycomb backdrop.
const HEX_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'><g fill='none' stroke='%234A90D9' stroke-width='1'><path d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5z'/><path d='M-13 33.25l13 7.5v15l-13 7.5L-26 55.75v-15l12.99-7.5z'/><path d='M40.99 33.25l13 7.5v15l-13 7.5L28 55.75v-15l12.99-7.5z'/><path d='M13.99-14.75l13 7.5v15l-13 7.5L1 7.75v-15l12.99-7.5z'/><path d='M-13 9.25l13 7.5v15l-13 7.5L-26 31.75v-15l12.99-7.5z'/><path d='M40.99 9.25l13 7.5v15l-13 7.5L28 31.75v-15l12.99-7.5z'/><path d='M13.99 57.25l13 7.5v15l-13 7.5L1 79.75v-15l12.99-7.5z'/></g></svg>`;
const HEX_BG = `url("data:image/svg+xml,${HEX_SVG}")`;

function Hex({ className }: { className?: string }) {
  return (
    <svg width="10" height="11" viewBox="0 0 10 11" className={className}>
      <path d="M5 0l4.33 2.5v5L5 10 .67 7.5v-5z" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function HudCard({ label, value, delta, progress }: { label: string; value: string; delta: string; progress: number }) {
  return (
    <div
      className="w-52 rounded-lg border border-[#4A90D9]/30 bg-black/70 px-4 py-3 backdrop-blur-md"
      style={{ boxShadow: "0 0 24px rgba(74,144,217,0.12), inset 0 0 20px rgba(74,144,217,0.05)" }}
    >
      <div className="flex items-center gap-2 text-[11px] tracking-[0.2em] text-[#4A90D9]/80">
        <Hex />
        {label}
      </div>
      <div
        className="mt-2 text-[42px] font-bold leading-none tabular-nums text-[#4A90D9]"
        style={{ textShadow: "0 0 18px rgba(74,144,217,0.5)" }}
      >
        {value}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#4A90D9]" style={{ width: `${progress}%`, boxShadow: "0 0 8px #4A90D9" }} />
        </div>
        <span className="whitespace-nowrap text-[10px] text-[#4A90D9]/70">{delta}</span>
      </div>
    </div>
  );
}

// Simulated circular audio wave drawn around the middle ring while speaking.
function CircularWaveform() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 220;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.05;
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const base = 90;
      const N = 140;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const amp = 6 * Math.sin(a * 6 + t * 3) + 4 * Math.sin(a * 11 - t * 2) + 3 * Math.sin(t * 5 + i * 0.3);
        const r = base + amp;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(34,197,94,0.85)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(34,197,94,0.7)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: 220, height: 220 }} className="pointer-events-none absolute" />;
}

// Deterministic ambient particles (no Math.random → no hydration mismatch).
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37 + 7) % 100,
  top: (i * 53 + 11) % 100,
  dur: 9 + (i % 5) * 4,
  delay: i % 7,
  anim: `jarvis-float${(i % 3) + 1}`,
}));

export function JarvisCommandCenter() {
  const router = useRouter();
  const { state, transcript, response, errorMsg, toggle, wakeWordActive, wakeWordSupported, startWakeWordListening, stopWakeWordListening } =
    useJarvis();
  const [stats, setStats] = useState<Stats | null>(null);
  const [clock, setClock] = useState("");

  // Start "jarvis" wake-word listening on this page (no-op if unsupported).
  useEffect(() => {
    startWakeWordListening();
    return () => stopWakeWordListening();
  }, [startWakeWordListening, stopWakeWordListening]);

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

  // Live clock — set only on client to avoid hydration mismatch.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("sk-SK"));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
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
  const prog = (n: number) => Math.min(100, 20 + n * 8);

  const outerAnim =
    state === "listening"
      ? "jarvis-pulse-fast 0.8s ease-in-out infinite"
      : state === "speaking"
        ? "spin 30s linear infinite"
        : "spin 20s linear infinite";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black text-white">
      <style>{`
        @keyframes jarvis-hex-drift { from { background-position: 0 0; } to { background-position: 56px 98px; } }
        @keyframes jarvis-scan { from { background-position: 0 0; } to { background-position: 0 100%; } }
        @keyframes jarvis-pulse-fast { 0%,100% { transform: scale(1); opacity: .4; } 50% { transform: scale(1.05); opacity: .8; } }
        @keyframes jarvis-pulse-slow { 0%,100% { opacity: .3; transform: scale(1); } 50% { opacity: .6; transform: scale(1.05); } }
        @keyframes jarvis-float1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(24px,-30px); } }
        @keyframes jarvis-float2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-28px,18px); } }
        @keyframes jarvis-float3 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(16px,26px); } }
      `}</style>

      {/* Radial aura behind the orb */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 50%, ${color}22 0%, rgba(0,0,0,0) 42%)`, transition: "background 0.5s" }}
      />
      {/* Hex grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: HEX_BG, opacity: 0.08, animation: "jarvis-hex-drift 40s linear infinite" }}
      />
      {/* Scan lines */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)",
          opacity: 0.03,
          animation: "jarvis-scan 8s linear infinite",
        }}
      />
      {/* Ambient particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute h-0.5 w-0.5 rounded-full bg-[#4A90D9]"
          style={{ left: `${p.left}%`, top: `${p.top}%`, opacity: 0.3, animation: `${p.anim} ${p.dur}s ease-in-out ${p.delay}s infinite` }}
        />
      ))}

      {/* Corner HUD cards */}
      <div className="absolute left-6 top-6">
        <HudCard label="LEADY DNES" value={stats ? String(stats.leadsToday) : "--"} delta={stats ? `+${stats.leadsToday} / 24h` : ""} progress={prog(stats?.leadsToday ?? 0)} />
      </div>
      <div className="absolute right-6 top-6 flex flex-col items-end gap-3">
        <button
          onClick={back}
          className="inline-flex items-center gap-2 rounded-lg border border-[#4A90D9]/30 bg-black/60 px-3 py-2 text-xs tracking-widest text-[#4A90D9] backdrop-blur-md transition-colors hover:border-[#4A90D9]/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          DASHBOARD
        </button>
        <HudCard label="EMAILOV SENT" value={stats ? String(stats.emailsSent) : "--"} delta="celkom" progress={prog(stats?.emailsSent ?? 0)} />
      </div>
      <div className="absolute bottom-16 left-6">
        <HudCard
          label="GOOGLE ADS"
          value={stats && stats.googleAdsSpend != null ? `${stats.googleAdsSpend.toFixed(0)}€` : "--"}
          delta="mesiac"
          progress={0}
        />
      </div>
      <div className="absolute bottom-16 right-6">
        <HudCard label="PROJEKTY" value={stats ? String(stats.projectsCount) : "--"} delta="konverzie" progress={prog(stats?.projectsCount ?? 0)} />
      </div>

      {/* Faint JARVIS title behind orb */}
      <div
        className="pointer-events-none absolute select-none text-[16vw] font-bold tracking-[0.1em] text-white"
        style={{ opacity: 0.05, top: "18%" }}
      >
        JARVIS
      </div>

      {/* Transcript */}
      <div className="z-10 mb-8 flex h-8 items-end">
        {transcript && <p className="max-w-[440px] text-center text-sm tracking-wide text-neutral-400">{transcript}</p>}
      </div>

      {/* Central orb — three concentric rings */}
      <button
        onClick={toggle}
        aria-label="Jarvis"
        className="relative z-10 flex items-center justify-center focus:outline-none"
        style={{ width: 260, height: 260 }}
      >
        {/* Outer ring (260) */}
        {state === "thinking" ? (
          <span
            className="absolute rounded-full"
            style={{
              width: 260,
              height: 260,
              background: "conic-gradient(from 0deg, #4A90D9, #7B61FF, #4A90D9)",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
              animation: "spin 3s linear infinite",
            }}
          />
        ) : (
          <span
            className="absolute rounded-full"
            style={{ width: 260, height: 260, border: `1px dashed ${color}`, opacity: 0.4, animation: outerAnim }}
          />
        )}

        {/* Middle ring (220) with glow */}
        <span
          className="absolute rounded-full"
          style={{ width: 220, height: 220, border: `2px solid ${color}`, boxShadow: `0 0 30px ${color}, 0 0 60px ${color}aa`, transition: "border-color 0.4s, box-shadow 0.4s" }}
        />
        {state === "speaking" && <CircularWaveform />}

        {/* Inner orb (180) */}
        <span
          className="absolute flex flex-col items-center justify-center rounded-full"
          style={{
            width: 180,
            height: 180,
            background: "radial-gradient(circle at 50% 45%, #0a1628 0%, #000 100%)",
            boxShadow: `inset 0 0 45px ${color}33`,
          }}
        >
          {state === "thinking" ? (
            <Loader2 className="h-10 w-10 animate-spin" style={{ color }} />
          ) : state === "speaking" ? (
            <Volume2 className="h-10 w-10" style={{ color }} />
          ) : state === "error" ? (
            <AlertTriangle className="h-10 w-10" style={{ color }} />
          ) : (
            <Mic className="h-10 w-10" style={{ color }} />
          )}
          <span className="mt-2 text-[10px] tracking-[0.3em] text-white/40">JARVIS v1.0</span>
        </span>
      </button>

      {/* State text */}
      <p className="z-10 mt-8 text-2xl font-bold" style={{ color, letterSpacing: "0.3em", textShadow: `0 0 20px ${color}88` }}>
        {STATE_TEXT[state]}
      </p>

      {/* Response */}
      <div className="z-10 mt-5 flex min-h-[3.5rem] max-w-[400px] items-start px-4">
        {errorMsg ? (
          <p className="flex items-center gap-2 text-center text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </p>
        ) : (
          response && <p className="text-center text-base leading-relaxed text-white/90">{response}</p>
        )}
      </div>

      {/* Wake-word indicator (above the status bar) */}
      {wakeWordSupported && wakeWordActive && (
        <div
          className="absolute bottom-12 right-6 z-10 flex items-center gap-1.5 text-[11px] tracking-[0.2em] text-green-400"
          style={{ opacity: 0.6 }}
        >
          <Hex className="text-green-400" />
          WAKE WORD ACTIVE
        </div>
      )}

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 border-t border-[#4A90D9]/15 bg-black/60 py-2 text-[11px] tracking-[0.2em] text-[#4A90D9]/50 backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          SYSTEM ONLINE
        </span>
        <span className="text-[#4A90D9]/25">·</span>
        <span>SB DESIGN AGENCY</span>
        <span className="text-[#4A90D9]/25">·</span>
        <span className="tabular-nums">{clock || "--:--:--"}</span>
        <span className="text-[#4A90D9]/25">·</span>
        <span>SESSION ACTIVE</span>
      </div>
    </div>
  );
}
