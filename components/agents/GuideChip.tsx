"use client";

// "Čo mám robiť?": postup na dnes, týždenný cieľ, zásoba leadov, upozornenia a vysvetlenie, ako
// celý systém funguje. Čísla sú z reálnych dát (rovnaké ako v ranom prehľade na Telegrame).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Compass, Loader2, X } from "lucide-react";
import type { Digest } from "@/lib/agents/digest";
import { cn } from "@/lib/utils";

const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const path = (href: string) => href.replace(/^https?:\/\/[^/]+/, "");
const SEEN_KEY = "agents-guide-seen-v2";

const FLOW: { when: string; who: string; text: string; tone: string }[] = [
  {
    when: "Večer",
    who: "Miro hľadá firmy",
    text: "Miro sám skenuje segment po segmente a kraj po kraji, analyzuje weby, hľadá e-maily a ku každej firme napíše odôvodnené posúdenie. Firmy bez doloženej príležitosti skryje s dôvodom.",
    tone: "#22d3ee",
  },
  {
    when: "Cez noc",
    who: "Nora píše ponuky",
    text: "Nora vezme vhodné firmy od Mira, zistí overené fakty, navrhne ponuku a napíše mail. Najviac 5 firiem za noc.",
    tone: "#f472b6",
  },
  {
    when: "Ráno 7:40",
    who: "Prehľad na Telegrame",
    text: "Príde ti správa: čo sa stalo cez noc a čo musíš urobiť ty. Rovnaké nájdeš tu.",
    tone: "#a78bfa",
  },
  {
    when: "Ty · 10–15 min",
    who: "Posúdenie ponúk",
    text: "Otvor pracovňu Nory a prečítaj hotové maily. Skontroluj tri veci: sedia fakty (každé má citát), znie mail ako ty, je ponuka jasná. Potom „Použiť ako koncept“, alebo zahoď.",
    tone: "#f59e0b",
  },
  {
    when: "Ty · 2 min",
    who: "Schválenie",
    text: "Vo fronte na schválenie schváľ koncepty. Odídu pri najbližšom odosielaní po 8:30 (limit 20 denne na kampaň). Bez tvojho schválenia nič neodíde.",
    tone: "#f59e0b",
  },
  {
    when: "Po odoslaní",
    who: "Odpovede a follow-upy",
    text: "Keď niekto odpovie, uvidíš to v prehľade. Follow-upy sa pripravia samy, ale tiež čakajú na tvoj súhlas.",
    tone: "#34d399",
  },
];

export function GuideChip({ onOpenWorkbench }: { onOpenWorkbench?: (leadId?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // panel sa vykresľuje mimo scény (portál), aby ho nič v scéne (bubliny agentov) neprekrývalo
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - 424)), top: r.bottom + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/agents/digest", { cache: "no-store" });
      if (r.ok) setD((await r.json()) as Digest);
    } catch {
      /* postup je doplnok, chyba ho nesmie rozbiť */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setOpen(true);
        localStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      /* súkromné okno */
    }
  }, [load]);

  const todo = d?.todo.reduce((a, t) => a + t.count, 0) ?? 0;
  const warns = d?.health.filter((h) => h.level !== "info") ?? [];
  const pct = d ? Math.min(100, Math.round((d.week.offers / d.week.target) * 100)) : 0;
  const done = d?.offers.filter((o) => o.status === "done") ?? [];

  return (
    <div className="pointer-events-auto relative">
      <button
        ref={btnRef}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition",
          open ? "border-amber-300/60 bg-amber-400/20 text-amber-100" : "border-amber-300/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
        )}
        title="Čo mám robiť?"
      >
        <Compass className="h-3.5 w-3.5" />
        <span>Čo mám robiť?</span>
        {d && todo > 0 && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-black">{todo}</span>}
        {warns.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-300" />}
      </button>
      {open && pos && createPortal(
        <div
          style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 70, maxHeight: `calc(100dvh - ${pos.top + 16}px)` }}
          className="w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-white/12 bg-[#0d1524]/97 p-4 text-xs shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Tvoj deň s agentmi</h3>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">Agenti robia prácu cez noc. Ty ráno posúdiš výsledok a schváliš, čo sa má odoslať. Zhruba 10 až 15 minút denne.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Zavrieť" className="rounded-lg p-1 text-muted hover:bg-white/10 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!d ? (
            <p className="flex items-center gap-2 text-muted">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Načítavam…</p>
          ) : (
            <>
              {warns.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {warns.map((h, i) => (
                    <li key={i} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 leading-snug", h.level === "error" ? "border-red-400/40 bg-red-400/10 text-red-100" : "border-amber-400/30 bg-amber-400/[0.07] text-amber-100")}>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">{h.text}</span>
                      {h.href && (
                        <Link href={path(h.href)} className="shrink-0 underline underline-offset-2">
                          Otvoriť
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Dnes musíš ty</p>
              {d.todo.length === 0 ? (
                <p className="mb-3 rounded-lg bg-emerald-400/[0.08] px-2.5 py-2 text-emerald-100">Nič. Všetko je vybavené, agenti pracujú ďalej.</p>
              ) : (
                <ul className="mb-3 space-y-1.5">
                  {d.todo.map((t, i) => {
                    const row = (
                      <>
                        <span className="mt-px flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10.5px] font-bold tabular-nums text-black">{i + 1}</span>
                        <span className="flex-1 leading-snug">
                          {t.label} <span className="font-semibold text-amber-200">({t.count})</span>
                          {t.detail && <span className="block text-[11px] text-muted">{t.detail}</span>}
                        </span>
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 text-muted transition group-hover:text-foreground" />
                      </>
                    );
                    const cls = "group flex w-full items-start gap-2.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-left text-foreground transition hover:bg-white/10";
                    return (
                      <li key={t.id}>
                        {t.external ? (
                          <a href={t.href} target="_blank" rel="noopener noreferrer" className={cls}>{row}</a>
                        ) : t.action === "workbench" && onOpenWorkbench ? (
                          <button type="button" onClick={() => { setOpen(false); onOpenWorkbench(); }} className={cls}>{row}</button>
                        ) : (
                          <Link href={path(t.href)} onClick={() => setOpen(false)} className={cls}>{row}</Link>
                        )}
                        {t.items && t.items.length > 0 && (
                          <ul className="mt-1 space-y-1 pl-8">
                            {t.items.map((it, k) => (
                              <li key={k} className="text-[11.5px] leading-snug text-red-200/90">
                                {onOpenWorkbench && it.leadId ? (
                                  <button type="button" onClick={() => { setOpen(false); onOpenWorkbench(it.leadId); }} className="text-left underline decoration-dotted underline-offset-2 hover:text-red-100">{it.label}</button>
                                ) : (
                                  it.label
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Koľko to stojí</p>
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Cez noc", d.cost.nightEur],
                    ["Za 24 hodín", d.cost.last24hEur],
                    ["Za 7 dní", d.cost.weekEur],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg bg-black/20 py-1.5">
                      <div className="text-[15px] font-semibold tabular-nums text-foreground">{eur(Number(v))}</div>
                      <div className="text-[10.5px] text-muted">{l}</div>
                    </div>
                  ))}
                </div>
                {d.cost.nightByAgent.length > 0 && (
                  <p className="mt-2 leading-snug text-muted">
                    Cez noc (00:00 až 08:00): {d.cost.nightByAgent.map((n) => `${n.agent === "nora" ? "Nora" : n.agent === "skaut" ? "Miro" : n.agent} ${eur(n.eur)}`).join(", ")}.
                  </p>
                )}
                <p className="mt-2 leading-snug text-muted">
                  Najbližší týždeň: <b className="text-foreground">{eur(d.cost.weekLowEur)} až {eur(d.cost.weekHighEur)}</b> (ponuka stojí ~0,30 € v základnom a ~0,49 € v hlbokom režime; Miro ~0,5 až 1,2 € denne).
                  {d.cost.daysUntilStop != null && d.cost.daysUntilStop < 30 && (
                    <span className="text-amber-200"> Pri plnom tempe ({eur(d.cost.monthHighEur)} mesačne) sa rozpočet {d.budget.capEur} € vyčerpá za ~{d.cost.daysUntilStop} dní a agenti sa zastavia.</span>
                  )}
                </p>
              </div>

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Tvoj týždeň (posledných 7 dní)</p>
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-foreground">Pripravené ponuky</span>
                  <span className="tabular-nums text-foreground"><b>{d.week.offers}</b> <span className="text-muted">z cieľa {d.week.target}</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-400" : "bg-sky-400")} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Odoslané", d.week.sent],
                    ["Otvorené", d.week.opened],
                    ["Odpovede", d.week.replied],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg bg-black/20 py-1.5">
                      <div className="text-base font-semibold tabular-nums text-foreground">{v}</div>
                      <div className="text-[10.5px] text-muted">{l}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 leading-snug text-muted">
                  Zásoba pre Noru: <b className="text-foreground">{d.supply.ready}</b> leadov, pri {d.supply.perNight} za noc vystačí ~<b className="text-foreground">{d.supply.daysLeft}</b> dní.
                  {d.budget.available && (
                    <>
                      {" "}Rozpočet: <b className="text-foreground">{eur(d.budget.spentEur)}</b> z {d.budget.capEur} € (odhad do konca mesiaca {eur(d.budget.projectedEur)}).
                    </>
                  )}
                </p>
              </div>

              {d.autopilot.available && (
                <>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Miro hľadá sám (7 dní)</p>
                  <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {[
                        ["Nájdené firmy", d.autopilot.found],
                        ["Posúdené", d.autopilot.assessed],
                        ["Vhodné", d.autopilot.suitable],
                        ["Ponuky Nory", d.autopilot.researched],
                        ["Odoslané", d.autopilot.sent],
                      ].map(([l, v]) => (
                        <div key={String(l)} className="rounded-lg bg-black/20 py-1.5">
                          <div className="text-[15px] font-semibold tabular-nums text-foreground">{v}</div>
                          <div className="px-0.5 text-[9.5px] leading-tight text-muted">{l}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 leading-snug text-muted">
                      Skryl som <b className="text-foreground">{d.autopilot.rejected}</b> firiem s dôvodom (v Leadoch, záložka Skryté). Dnes {d.autopilot.scansToday} {d.autopilot.scansToday === 1 ? "sken" : "skeny"}.
                    </p>
                    {d.autopilot.segments.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {d.autopilot.segments.map((sg) => (
                          <li key={sg.id}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={cn("truncate", sg.focus ? "font-semibold text-sky-200" : "text-foreground/85")}>
                                {sg.focus && "▶ "}
                                {sg.name}
                              </span>
                              <span className="shrink-0 text-[10.5px] tabular-nums text-muted">
                                kolo {sg.sweeps + 1} · {sg.scans} skenov · {sg.suitable} vhodných
                              </span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
                              <div className={cn("h-full rounded-full", sg.focus ? "bg-sky-400" : "bg-white/30")} style={{ width: `${Math.round(sg.progress * 100)}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {(d.learned.summary || d.learned.lessons.length > 0 || d.news) && (
                <>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Čo sa agenti naučili</p>
                  <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 leading-snug text-foreground/90">
                    {d.learned.summary && <p className="mb-1.5">{d.learned.summary}</p>}
                    {d.learned.lessons.length > 0 && (
                      <ul className="list-disc space-y-1 pl-4 text-muted">
                        {d.learned.lessons.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    )}
                    {d.news && <p className="mt-1.5 text-amber-200">Novinky z AI: {d.news.body}</p>}
                  </div>
                </>
              )}

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Ako to funguje</p>
              <ol className="mb-3 space-y-2">
                {FLOW.map((s) => (
                  <li key={s.when} className="flex gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: s.tone }} />
                    <span className="leading-snug text-foreground/90">
                      <b className="text-foreground">{s.when}</b> · {s.who}
                      <span className="block text-muted">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Cez noc sa stalo (posledných {d.sinceHours} h)</p>
              <ul className="space-y-1 text-foreground/90">
                {!d.offers.length && !d.scoutRejected.length && <li className="text-muted">Agenti nič nespracovali.</li>}
                {done.length > 0 && <li>Nora pripravila <b>{done.length}</b> {done.length === 1 ? "ponuku" : done.length < 5 ? "ponuky" : "ponúk"}: {done.slice(0, 4).map((o) => o.company).join(", ")}{done.length > 4 ? "…" : ""}</li>}
                {d.scoutRejected.length > 0 && <li>Miro vyradil <b>{d.scoutRejected.length}</b> nevhodných firiem</li>}
                {d.offers.filter((o) => o.status === "failed").length > 0 && <li className="text-red-300">Zlyhalo {d.offers.filter((o) => o.status === "failed").length} behov</li>}
                {d.replies.length > 0 && <li>Odpovedali: <b>{d.replies.map((r) => r.company).slice(0, 4).join(", ")}</b></li>}
                {(d.opens > 0 || d.clicks > 0) && <li>Maily: {d.opens} otvorení, {d.clicks} klikov</li>}
                <li className="text-muted">Minuté: {eur(d.spentSinceEur)}</li>
              </ul>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
