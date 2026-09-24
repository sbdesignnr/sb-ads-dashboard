"use client";

// Pracovňa Nory: zadáš lead, agent do 1–2 minút pripraví overené zistenia, ponuku na mieru
// a mail. Všetko so zdrojmi, aby si vedel skontrolovať každé tvrdenie. Nič neodíde bez teba.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  FileSearch,
  Loader2,
  Mail,
  Play,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ago } from "./AgentPanel";
import type { ResearchBrief } from "@/lib/agents/research";

interface LeadRow {
  id: string;
  companyName: string;
  companyCity: string | null;
  websiteUrl: string | null;
  websiteScore: number | null;
  companyEmail: string | null;
  segment: { name: string } | null;
  /** skóre príležitosti a dôvody od Skauta (len pri jeho výbere) */
  opportunity?: number;
  reasons?: string[];
}
interface RunRow {
  id: string;
  status: "running" | "done" | "failed";
  step: string | null;
  offerName: string | null;
  costEur: number | null;
  emailSubject: string | null;
  appliedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  lead: { id: string; companyName: string; companyCity: string | null };
}
interface ListData {
  runs: RunRow[];
  candidates: LeadRow[];
  candidateTotal?: number;
  found: LeadRow[];
  pinned: LeadRow | null;
}
interface RunDetail extends Omit<RunRow, "lead"> {
  brief: ResearchBrief | null;
  emailBody: string | null;
  lead: {
    id: string;
    companyName: string;
    companyCity: string | null;
    websiteUrl: string | null;
    companyEmail: string | null;
    websiteScore: number | null;
  };
}

const eur = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(2).replace(".", ",")} €`);
const COST_HINT = "≈ 0,15 €";

const STEPS = [
  { key: "collect", label: "Zbieram dôkazy (web, Google profil, konkurenti)" },
  { key: "analyse", label: "Vyhodnocujem dôkazy, navrhujem ponuku" },
  { key: "verify", label: "Overujem citáty a tvrdenia" },
  { key: "write", label: "Píšem a kontrolujem mail" },
] as const;

function stepIndex(step: string | null): number {
  if (!step) return 0;
  if (/Píšem|e-mail/i.test(step)) return 3;
  if (/Kontrolujem|Overené zistenia|Overujem/i.test(step)) return 2;
  if (/Vyhodnocujem|Opakujem/i.test(step)) return 1;
  return 0;
}

function StatusPill({ run }: { run: Pick<RunRow, "status" | "appliedAt" | "emailSubject"> }) {
  const [label, color] =
    run.status === "running"
      ? ["Pracuje", "#22c55e"]
      : run.status === "failed"
        ? ["Nepodarilo sa", "#ef4444"]
        : run.appliedAt
          ? ["Koncept vytvorený", "#60a5fa"]
          : ["Čaká na posúdenie", "#f59e0b"];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ background: `${color}22`, color }}>
      <span className={cn("h-1.5 w-1.5 rounded-full", run.status === "running" && "animate-pulse")} style={{ background: color }} />
      {label}
    </span>
  );
}

export function Workbench({
  initialLeadId,
  onClose,
  onChanged,
}: {
  initialLeadId?: string | null;
  onClose: () => void;
  /** po spustení / zmene chcem, aby svet hneď obnovil stav */
  onChanged: () => void;
}) {
  const [data, setData] = useState<ListData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const qRef = useRef("");
  qRef.current = q;

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (qRef.current.trim()) p.set("q", qRef.current.trim());
      if (initialLeadId) p.set("lead", initialLeadId);
      const r = await fetch(`/api/agents/research?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j as ListData);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [initialLeadId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/agents/research/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setDetail(j.run as RunDetail);
    } catch {
      /* ticho */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const running = data?.runs.find((r) => r.status === "running") ?? null;
  useEffect(() => {
    if (!running && detail?.status !== "running") return;
    const t = setInterval(() => {
      load();
      if (selected) loadDetail(selected);
    }, 3000);
    return () => clearInterval(t);
  }, [running, detail?.status, selected, load, loadDetail]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  // po skončení behu sa svet dozvie o novom stave
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) onChanged();
    wasRunning.current = Boolean(running);
  }, [running, onChanged]);

  const start = async (lead: { id: string; companyName: string }) => {
    if (
      !confirm(
        `Nora pripraví ponuku pre „${lead.companyName}“.\n\nTrvá 1 až 2 minúty a stojí približne 0,15 € (AI + Google). Nič sa neodošle bez tvojho schválenia.`,
      )
    )
      return;
    setBusy(lead.id);
    try {
      const r = await fetch("/api/agents/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      toast.success("Nora sa pustila do práce.");
      setSelected(j.id);
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const apply = async (id: string, force = false) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/agents/research/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const j = await r.json();
      if (r.status === 409 && j.code === "edited") {
        if (confirm(`${j.error}\n\nTvoje ručné úpravy sa stratia.`)) return apply(id, true);
        return;
      }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      toast.success(j.replaced ? "Koncept prepísaný. Nájdeš ho vo fronte na schválenie." : "Koncept vytvorený. Nájdeš ho vo fronte na schválenie.", { duration: 6000 });
      await Promise.all([load(), loadDetail(id)]);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const discard = async (id: string) => {
    if (!confirm("Zahodiť tento výskum? Koncept mailu, ak už vznikol, ostane.")) return;
    await fetch(`/api/agents/research/${id}`, { method: "DELETE" });
    setSelected(null);
    await load();
    onChanged();
  };

  const leadsToShow: LeadRow[] = useMemo(() => {
    if (!data) return [];
    const base = q.trim() ? data.found : data.candidates;
    const list = data.pinned && !base.some((l) => l.id === data.pinned!.id) ? [data.pinned, ...base] : base;
    return list;
  }, [data, q]);

  return (
    <div className="absolute inset-2 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b1220]/[0.985] shadow-2xl shadow-black/60 backdrop-blur-xl md:inset-4">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Pracovňa Nory</h2>
          <p className="text-xs text-muted">Ponuky na mieru z overených dát. Každé zistenie má zdroj, nič neodíde bez teba.</p>
        </div>
        <button onClick={onClose} aria-label="Zavrieť" className="rounded-lg p-2 text-muted transition hover:bg-white/10 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ľavý stĺpec */}
        <div className={cn("min-h-0 shrink-0 overflow-y-auto border-white/10 p-3 md:w-[340px] md:border-r", selected && "max-md:hidden")}>
          {loadError && (
            <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
              Nepodarilo sa načítať ({loadError}). Ak ide o novú inštaláciu, chýba databázová tabuľka lead_research.
            </p>
          )}

          <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">Pripraviť ponuku</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať firmu podľa názvu…"
              className="w-full rounded-lg border border-white/12 bg-white/[0.04] py-2 pl-8 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-white/30"
            />
          </div>
          <p className="mb-2 px-1 text-[11px] text-muted">
            {q.trim()
              ? "Výsledky hľadania"
              : `Výber Skauta Mira: top ${leadsToShow.length} z ${data?.candidateTotal ?? "…"} vhodných leadov`}{" "}
            · {COST_HINT} za firmu
          </p>
          <ul className="mb-4 space-y-1.5">
            {!data && <li className="px-1 text-xs text-muted">Načítavam…</li>}
            {data && leadsToShow.length === 0 && <li className="px-1 text-xs text-muted">Nič sa nenašlo.</li>}
            {leadsToShow.map((l) => (
              <li key={l.id} className={cn("flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-2", data?.pinned?.id === l.id && "border-amber-400/50 bg-amber-400/[0.06]")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{l.companyName}</p>
                  <p className="truncate text-[11px] text-muted">
                    {[l.companyCity, l.segment?.name].filter(Boolean).join(" · ")}
                    {l.websiteScore != null && ` · skóre ${l.websiteScore}`}
                    {!l.companyEmail && <span className="text-amber-300"> · bez e-mailu</span>}
                  </p>
                  {l.reasons && l.reasons.length > 0 && (
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-sky-300/80">{l.reasons.slice(0, 3).join(" · ")}</p>
                  )}
                </div>
                {l.opportunity != null && (
                  <span title="Skóre príležitosti" className="shrink-0 rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-sky-300">
                    {l.opportunity}
                  </span>
                )}
                <button
                  onClick={() => start(l)}
                  disabled={busy !== null || Boolean(running)}
                  title={running ? "Nora ešte pracuje na inom leade" : "Spustiť agenta"}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-primary/90 px-2.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-primary disabled:opacity-40"
                >
                  {busy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Spustiť
                </button>
              </li>
            ))}
          </ul>

          <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">Ponuky a behy</p>
          <ul className="space-y-1.5">
            {data && data.runs.length === 0 && <li className="px-1 text-xs text-muted">Zatiaľ žiadne. Spusti prvú vyššie.</li>}
            {data?.runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    "w-full rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-2 text-left transition hover:bg-white/[0.07]",
                    selected === r.id && "border-white/35 bg-white/[0.09]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-foreground">{r.lead.companyName}</p>
                    <StatusPill run={r} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {r.status === "running" ? (r.step ?? "Pracuje…") : (r.offerName ?? r.error ?? "")}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-muted/80">
                    {ago(r.createdAt)}
                    {r.costEur != null && ` · AI ${eur(r.costEur)}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* pravý stĺpec */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", !selected && "max-md:hidden")}>
          {!selected && (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center text-muted">
              <FileSearch className="h-10 w-10 opacity-50" />
              <p className="max-w-sm text-sm">
                Vyber firmu vľavo a spusti Noru, alebo otvor už hotový výskum. Uvidíš zistenia so zdrojmi, ponuku a mail, ktorý z nich vznikol.
              </p>
            </div>
          )}
          {selected && (
            <>
              <button onClick={() => setSelected(null)} className="mb-3 text-xs text-muted hover:text-foreground md:hidden">
                ← Späť na zoznam
              </button>
              {!detail && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
                </p>
              )}
              {detail && (
                <RunView
                  run={detail}
                  busy={busy === detail.id}
                  onApply={() => apply(detail.id)}
                  onDiscard={() => discard(detail.id)}
                  onRetry={() => start(detail.lead)}
                  canStart={!running && busy === null}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── detail behu ────────────────────────────────────────────────────────────

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function RunView({
  run,
  busy,
  onApply,
  onDiscard,
  onRetry,
  canStart,
}: {
  run: RunDetail;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  canStart: boolean;
}) {
  const b = run.brief;
  const evidenceTitle = (eid: string) => {
    const it = b?.evidence.find((e) => e.id === eid);
    return it ? `${eid} · ${it.title}` : eid;
  };
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDropped, setShowDropped] = useState(false);
  const idx = stepIndex(run.step);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground">{run.lead.companyName}</h3>
          <p className="text-xs text-muted">
            {[run.lead.companyCity, run.lead.companyEmail].filter(Boolean).join(" · ")}
            {run.lead.websiteUrl && (
              <>
                {" · "}
                <a href={run.lead.websiteUrl} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
                  web
                </a>
              </>
            )}
            {" · "}
            <Link href={`/leads/${run.lead.id}`} className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
              detail leadu
            </Link>
          </p>
        </div>
        <StatusPill run={run} />
      </div>

      {run.status === "running" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-green-400" />
            Nora pracuje. Môžeš zavrieť pracovňu, výsledok nájdeš tu.
          </p>
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.key} className={cn("flex items-center gap-2 text-[13px]", i > idx && "text-muted/60", i === idx && "font-medium text-foreground")}>
                {i < idx ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : i === idx ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-white/20" />
                )}
                {s.label}
              </li>
            ))}
          </ol>
          {run.step && <p className="mt-3 text-[11.5px] text-muted">{run.step}</p>}
        </div>
      )}

      {run.status === "failed" && (
        <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-red-300">
            <CircleAlert className="h-4 w-4" /> Nora to tentoraz nedotiahla
          </p>
          <p className="text-[13px] text-red-200/90">{run.error ?? "Neznáma chyba."}</p>
          <p className="mt-2 text-[12px] text-muted">Nepodložené tvrdenia radšej zahodí, než by hádala. Skús znova, alebo vyber iný lead.</p>
          <button onClick={onRetry} disabled={!canStart} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/20 disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> Skúsiť znova ({COST_HINT})
          </button>
        </div>
      )}

      {b && run.status !== "running" && (
        <>
          {b.understanding && (
            <Section title="Čomu rozumiem">
              <p className="text-[13.5px] leading-relaxed text-foreground/90">{b.understanding}</p>
            </Section>
          )}

          <Section title={`Overené zistenia (${b.findings.length})`} hint="každé má citát zo zdroja, ktorý kód aj druhá kontrola overili">
            <ul className="space-y-2.5">
              {b.findings.map((f) => (
                <li key={f.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-start gap-2">
                    <BadgeCheck className={cn("mt-0.5 h-4 w-4 shrink-0", f.audit === "ok" ? "text-green-400" : "text-amber-300")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium leading-snug text-foreground">{f.claim}</p>
                      {f.why && <p className="mt-1 text-[12.5px] leading-snug text-muted">{f.why}</p>}
                      {f.audit === "partial" && (
                        <p className="mt-1 text-[11.5px] text-amber-300">Čiastočne podložené, v maile sa nepoužije. {f.auditNote}</p>
                      )}
                      <ul className="mt-2 space-y-1.5">
                        {f.evidence.map((e, i) => (
                          <li key={i} className="border-l-2 border-white/15 pl-2.5">
                            <p className="text-[12px] italic leading-snug text-foreground/85">„{e.quote}“</p>
                            <p className="text-[10.5px] text-muted">{evidenceTitle(e.eid)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {b.dropped.length > 0 && (
              <button onClick={() => setShowDropped((v) => !v)} className="mt-2 flex items-center gap-1 text-[11.5px] text-muted hover:text-foreground">
                <ChevronDown className={cn("h-3.5 w-3.5 transition", showDropped && "rotate-180")} />
                Zahodených {b.dropped.length} (nepodložené)
              </button>
            )}
            {showDropped && (
              <ul className="mt-2 space-y-1.5">
                {b.dropped.map((d) => (
                  <li key={d.id} className="rounded-lg border border-white/8 px-3 py-2 text-[12px] text-muted">
                    <span className="line-through decoration-white/25">{d.claim}</span>
                    <br />
                    <span className="text-[11px] text-red-300/80">{d.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {b.offer && (
            <Section title="Ponuka na mieru" hint={b.offer.from_catalog ? "z tvojho katalógu ponúk" : "MIMO katalógu, over, či to vieš dodať"}>
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3.5">
                <p className="text-[14px] font-semibold text-foreground">{b.offer.name}</p>
                <dl className="mt-2 space-y-2 text-[13px] leading-snug">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">Čo dostanú</dt>
                    <dd className="text-foreground/90">{b.offer.deliverable}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">Prečo práve toto</dt>
                    <dd className="text-foreground/90">{b.offer.why_this}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-muted">Termín</dt>
                      <dd className="text-foreground/90">{b.offer.timeline}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-muted">Bez rizika</dt>
                      <dd className="text-foreground/90">{b.offer.risk_reversal}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">Čo musíš urobiť ty</dt>
                    <dd className="text-foreground/90">{b.offer.my_upfront_work}</dd>
                  </div>
                </dl>
              </div>
            </Section>
          )}

          {run.emailBody ? (
            <Section title="Mail" hint="skontroluj vety a fakty, potom z neho urob koncept">
              <div className="rounded-xl border border-white/12 bg-white/[0.04]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2 text-[13px]">
                  <Mail className="h-3.5 w-3.5 text-muted" />
                  <span className="text-muted">Predmet:</span>
                  <span className="font-medium text-foreground">{run.emailSubject}</span>
                </div>
                <pre className="whitespace-pre-wrap px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-foreground/95">{run.emailBody}</pre>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={onApply}
                  disabled={busy || Boolean(run.appliedAt)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {run.appliedAt ? "Použité ako koncept" : "Použiť ako koncept"}
                </button>
                {run.appliedAt && (
                  <Link href="/leads/kampane" className="inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline">
                    Otvoriť frontu na schválenie <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button onClick={onDiscard} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] text-muted transition hover:bg-white/10 hover:text-red-300">
                  <Trash2 className="h-3.5 w-3.5" /> Zahodiť výskum
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-muted">
                Koncept sa nikam neodošle, kým ho neschváliš v kampaniach. Ak lead už má koncept, prepíše sa (ručne upravený sa spýta).
              </p>
            </Section>
          ) : (
            run.status === "done" && (
              <Section title="Mail">
                <p className="text-[13px] text-amber-300">{run.error ?? "Mail sa nepodarilo napísať."}</p>
              </Section>
            )
          )}

          {b.nicheNotes && (
            <Section title="Kontext odboru" hint="všeobecná znalosť, neoverené tvrdenie o firme">
              <p className="text-[12.5px] leading-relaxed text-muted">{b.nicheNotes}</p>
            </Section>
          )}

          <Section title="Zdroje a dôkazy">
            <button onClick={() => setShowEvidence((v) => !v)} className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground">
              <ChevronDown className={cn("h-3.5 w-3.5 transition", showEvidence && "rotate-180")} />
              {b.evidence.length} dôkazových položiek, z ktorých Nora vychádzala
            </button>
            {showEvidence && (
              <ul className="mt-2 space-y-2">
                {b.evidence.map((e) => (
                  <li key={e.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[12px] font-medium text-foreground">
                      {e.id} · {e.title}
                    </p>
                    <p className="truncate text-[10.5px] text-muted">
                      {/^https?:/.test(e.source) ? (
                        <a href={e.source} target="_blank" rel="noreferrer" className="underline decoration-white/20">
                          {e.source}
                        </a>
                      ) : (
                        e.source
                      )}
                    </p>
                    <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11.5px] leading-snug text-muted">{e.text}</pre>
                  </li>
                ))}
              </ul>
            )}
            {b.notes.length > 0 && (
              <p className="mt-2 text-[11.5px] text-muted">
                Čo sa nepodarilo zistiť: {b.notes.join(" · ")}
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-muted">
              Cena tohto behu: AI {eur(run.costEur)} (+ Google Places približne 0,05 €).
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
