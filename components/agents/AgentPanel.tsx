"use client";

// Bočný panel: vizitka agenta, dialóg (agent odpovedá podľa reálnych dát), štatistiky a aktivita.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, FileSearch, Hammer, MessageCircle, Sparkles, X } from "lucide-react";
import {
  STATUS_COLOR,
  statusLabel,
  departmentById,
  type AgentDef,
  type AgentSnapshot,
  type PlotDef,
} from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

export const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "práve teraz";
  if (s < 3600) return `pred ${Math.floor(s / 60)} min`;
  if (s < 86400) return `pred ${Math.floor(s / 3600)} h`;
  return `pred ${Math.floor(s / 86400)} d`;
};

interface Msg {
  id: number;
  from: "agent" | "me";
  text: string;
  cta?: { href?: string; label: string; action?: "workbench" };
}

/** Text sa "píše" po znakoch, ako keby ho agent práve vyťukával. */
function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    const t = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 16);
    return () => clearInterval(t);
  }, [text]);
  useEffect(() => {
    if (n >= text.length) onDone?.();
  }, [n, text, onDone]);
  return <span className={n < text.length ? "ag-caret" : undefined}>{text.slice(0, n)}</span>;
}

function Avatar({ agent, size = 56 }: { agent: AgentDef; size?: number }) {
  const l = agent.look;
  return (
    <svg width={size} height={size} viewBox="-26 -100 52 66" className="shrink-0 rounded-2xl" style={{ background: "linear-gradient(160deg,#243756,#152036)" }}>
      <defs>
        <radialGradient id={`face-${agent.id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#8a5a40" stopOpacity={0.5} />
        </radialGradient>
      </defs>
      <circle cx={0} cy={-90} r={9.5} fill={l.hair} />
      <rect x={-13.5} y={-54} width={27} height={26} rx={10} fill={l.outfit} />
      <path d="M-7,-54 L0,-45 L7,-54 Z" fill="#dbe4ff" />
      <rect x={-3.5} y={-58} width={7} height={7} fill={l.skin} />
      <circle cx={0} cy={-68} r={16} fill={l.skin} />
      <circle cx={0} cy={-68} r={16} fill={`url(#face-${agent.id})`} />
      <path d="M-16,-68 Q-18,-90 0,-90 Q18,-90 16,-68 Q12,-79 3,-79.5 Q-6,-80 -10,-74 Q-13,-72 -16,-68 Z" fill={l.hair} />
      <circle cx={-10.5} cy={-62} r={3.2} fill="#ff8fa3" opacity={0.32} />
      <circle cx={10.5} cy={-62} r={3.2} fill="#ff8fa3" opacity={0.32} />
      <ellipse cx={-6.5} cy={-67} rx={2.2} ry={2.9} fill="#2a1f1c" />
      <ellipse cx={6.5} cy={-67} rx={2.2} ry={2.9} fill="#2a1f1c" />
      {l.glasses && (
        <g fill="#fff" fillOpacity={0.12} stroke="#2b2f3a" strokeWidth={1.4}>
          <circle cx={-6.5} cy={-67} r={6} />
          <circle cx={6.5} cy={-67} r={6} />
        </g>
      )}
      <path d="M-3,-59.6 Q0,-57.4 3,-59.6" stroke="#8a3f3a" strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function AgentPanel({
  agent,
  snap,
  onClose,
  onSay,
  onOpenWorkbench,
}: {
  agent: AgentDef;
  snap: AgentSnapshot | null;
  onClose: () => void;
  /** agent povie vetu aj v scéne */
  onSay: (text: string) => void;
  onOpenWorkbench: () => void;
}) {
  const dept = departmentById(agent.department);
  const status = snap?.status ?? "idle";
  const counters = useMemo(() => snap?.counters ?? {}, [snap]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const idRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const lastLine = useRef<string>("");

  const say = useCallback(
    (text: string, cta?: Msg["cta"]) => {
      lastLine.current = text;
      setMsgs((m) => [...m.slice(-14), { id: ++idRef.current, from: "agent", text, cta }]);
      // do scény ide len prvý riadok (zoznamy s odrážkami sa v bubline nečítajú)
      onSay(text.split("\n")[0]);
    },
    [onSay],
  );
  const ask = useCallback((q: string) => {
    setMsgs((m) => [...m.slice(-14), { id: ++idRef.current, from: "me", text: q }]);
  }, []);

  // pozdrav pri otvorení (a pri zmene agenta)
  useEffect(() => {
    setMsgs([]);
    const t = setTimeout(() => {
      const greet = agent.lines.greet[Math.floor(Math.random() * agent.lines.greet.length)](counters);
      say(greet);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const showOffers = async () => {
    ask("Ukáž hotové ponuky");
    try {
      const r = await fetch("/api/agents/research", { cache: "no-store" });
      const j = (await r.json()) as { runs?: { status: string; appliedAt: string | null; emailSubject: string | null; offerName: string | null; lead: { companyName: string; companyCity: string | null } }[] };
      const ready = (j.runs ?? []).filter((x) => x.status === "done" && !x.appliedAt && x.emailSubject);
      if (!ready.length) return setTimeout(() => say("Zatiaľ nemám žiadnu hotovú ponuku na posúdenie. Cez noc pripravím ďalšie a ráno ti to napíšem na Telegram."), 300);
      const lines = ready.slice(0, 6).map((x) => `• ${x.lead.companyName}${x.lead.companyCity ? ` (${x.lead.companyCity})` : ""}: ${x.offerName ?? "ponuka"}`);
      setTimeout(() => say(`Hotové ponuky na posúdenie (${ready.length}):\n${lines.join("\n")}`, { action: "workbench", label: "Otvoriť pracovňu" }), 300);
    } catch {
      setTimeout(() => say("Zoznam sa nepodarilo načítať. Skús otvoriť pracovňu."), 300);
    }
  };
  const showPicks = async () => {
    ask("Koho si vybral?");
    try {
      const r = await fetch("/api/agents/skaut", { cache: "no-store" });
      const j = (await r.json()) as { candidates?: number; picks?: { lead: { companyName: string; companyCity: string | null }; score: number; reasons: string[] }[] };
      const picks = j.picks ?? [];
      if (!picks.length) return setTimeout(() => say("Zásoba je prázdna. Ráno idem hľadať nové firmy."), 300);
      const lines = picks.slice(0, 5).map((p) => `• ${p.lead.companyName}${p.lead.companyCity ? ` (${p.lead.companyCity})` : ""}: skóre ${p.score}${p.reasons.length ? `, ${p.reasons.slice(0, 2).join(", ")}` : ""}`);
      setTimeout(() => say(`Najlepší z ${j.candidates ?? picks.length} leadov v zásobe:\n${lines.join("\n")}\nNora ich spracuje cez noc, jednu firmu po druhej.`, { action: "workbench", label: "Otvoriť pracovňu Nory" }), 300);
    } catch {
      setTimeout(() => say("Výber sa nepodarilo načítať."), 300);
    }
  };
  const chip = (label: string, run: () => void) => ({ label, run });
  const qs = [
    chip("Čo mám dnes urobiť?", () => {
      ask("Čo mám dnes urobiť?");
      const t = agent.answers.today(status, counters);
      setTimeout(() => say(t.text, t.cta && (t.href || t.action) ? { href: t.href, action: t.action, label: t.cta } : undefined), 380);
    }),
    agent.id === "nora" ? chip("Ukáž hotové ponuky", showOffers) : chip("Koho si vybral?", showPicks),
    chip("Čo práve robíš?", () => {
      ask("Čo práve robíš?");
      setTimeout(() => say(agent.answers.status(status, counters)), 380);
    }),
    chip("Ako pracuješ?", () => {
      ask("Ako pracuješ?");
      setTimeout(() => say(agent.answers.method), 380);
    }),
  ];

  const color = STATUS_COLOR[status];

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="absolute inset-x-2 bottom-2 z-30 flex max-h-[68%] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524]/92 shadow-2xl shadow-black/50 backdrop-blur-xl md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[380px]"
      style={{ borderTop: `3px solid ${dept?.color ?? color}` }}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <Avatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-foreground">{agent.name}</h3>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `${color}22`, color }}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", status !== "idle" && "animate-pulse")} style={{ background: color }} />
              {statusLabel(agent, status)}
            </span>
          </div>
          <p className="text-xs text-muted">{agent.role}</p>
          <p className="mt-0.5 text-[11px]" style={{ color: dept?.color }}>
            {dept?.name}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Zavrieť"
          className="rounded-lg p-1.5 text-muted transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {agent.workbench && (
          <button
            onClick={onOpenWorkbench}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            <FileSearch className="h-4 w-4" />
            Otvoriť pracovňu · pripraviť ponuku
          </button>
        )}
        {snap?.headline && (
          <p className="mb-3 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[13px] leading-snug text-foreground/90">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />
            {snap.headline}
          </p>
        )}

        {/* dialóg */}
        <div ref={logRef} className="mb-2 max-h-80 space-y-2 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[92%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-snug",
                  m.from === "me"
                    ? "rounded-br-md bg-primary/85 text-white"
                    : "rounded-bl-md border border-white/8 bg-white/[0.06] text-foreground",
                )}
              >
                {m.from === "agent" && i === msgs.length - 1 ? <Typed text={m.text} /> : m.text}
                {m.cta &&
                  (m.cta.action === "workbench" ? (
                    <button
                      onClick={onOpenWorkbench}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
                    >
                      {m.cta.label}
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <Link
                      href={m.cta.href ?? "#"}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
                    >
                      {m.cta.label}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Opýtaj sa</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {qs.map((q) => (
            <button
              key={q.label}
              onClick={q.run}
              className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-muted transition hover:border-white/25 hover:bg-white/10 hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
        </div>

        {snap && snap.stats.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-1.5">
            {snap.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2">
                <div className="text-lg font-semibold leading-none tabular-nums text-foreground">{s.value}</div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">O agentovi</p>
          <p className="text-[13px] leading-relaxed text-foreground/85">{agent.bio}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agent.skills.map((s) => (
              <span key={s} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-foreground/80">
                {s}
              </span>
            ))}
          </div>
        </div>

        {snap && snap.activity.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Posledná aktivita</p>
            <ul className="space-y-1.5">
              {snap.activity.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: e.tone === "ok" ? "#22c55e" : e.tone === "warn" ? "#f59e0b" : "#64748b" }}
                  />
                  <span className="flex-1 text-foreground/85">{e.text}</span>
                  <span className="shrink-0 text-[11px] text-muted">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {agent.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/10"
            >
              {l.label}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
            </Link>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}

/** Panel prázdnej parcely: nápad na budúceho agenta. */
export function PlotPanel({ plot, onClose }: { plot: PlotDef; onClose: () => void }) {
  const dept = departmentById(plot.department);
  return (
    <motion.aside
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="absolute inset-x-2 bottom-2 z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524]/92 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-[380px]"
      style={{ borderTop: `3px solid ${dept?.color}` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${dept?.color}22`, color: dept?.color }}>
          <Hammer className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Voľná parcela</p>
          <h3 className="text-lg font-semibold text-foreground">{plot.idea.title}</h3>
          <p className="text-[11px]" style={{ color: dept?.color }}>
            {dept?.name}
          </p>
        </div>
        <button onClick={onClose} aria-label="Zavrieť" className="rounded-lg p-1.5 text-muted transition hover:bg-white/10 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{plot.idea.text}</p>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[12.5px] leading-relaxed text-muted">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          Ako sem nasťahovať agenta
        </p>
        Povedz Claude Code, aký agent to má byť. Pridá mu meno, vzhľad a dom sa postaví tu. Stav a hlášky sa napoja na reálne dáta z aplikácie.
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted">
        <MessageCircle className="h-3.5 w-3.5" />
        Štvrť: {dept?.name}
      </p>
    </motion.aside>
  );
}
