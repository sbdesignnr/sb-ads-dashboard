"use client";

// Ranný prehľad: čo agenti urobili cez noc a čo musíš urobiť ty (rovnaký obsah ako správa na Telegrame).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Sunrise } from "lucide-react";
import type { Digest } from "@/lib/agents/digest";

const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

export function MorningChip() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/agents/digest", { cache: "no-store" });
      if (r.ok) setD((await r.json()) as Digest);
    } catch {
      /* prehľad je doplnok, chyba ho nesmie rozbiť */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const todo = d?.todo.reduce((a, t) => a + t.count, 0) ?? 0;
  const done = d?.offers.filter((o) => o.status === "done") ?? [];
  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="flex items-center gap-2 rounded-xl border border-white/12 bg-[#0d1524]/80 px-3 py-2 text-xs shadow-lg backdrop-blur-md transition hover:bg-white/10"
        title="Ranný prehľad"
      >
        <Sunrise className="h-3.5 w-3.5 text-amber-300" />
        <span className="font-semibold text-foreground max-md:hidden">Ranný prehľad</span>
        {d && todo > 0 && <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-300">{todo}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[80] mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/12 bg-[#0d1524]/96 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
          {!d ? (
            <p className="flex items-center gap-2 text-muted">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Načítavam…</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Za posledných {d.sinceHours} hodín</p>
              <ul className="space-y-1.5 text-foreground/90">
                {!d.offers.length && !d.mockupsMade && !d.scoutRejected.length && <li className="text-muted">Agenti nič nespracovali.</li>}
                {done.length > 0 && <li>Nora pripravila <b>{done.length}</b> {done.length === 1 ? "ponuku" : done.length < 5 ? "ponuky" : "ponúk"}: {done.slice(0, 4).map((o) => o.company).join(", ")}{done.length > 4 ? "…" : ""}</li>}
                {d.mockupsMade > 0 && <li>Ateliér navrhol <b>{d.mockupsMade}</b> {d.mockupsMade === 1 ? "domovskú stránku" : "domovské stránky"}{d.premiumMade ? ` (prémiových ${d.premiumMade})` : ""}</li>}
                {d.scoutRejected.length > 0 && <li>Miro vyradil <b>{d.scoutRejected.length}</b> nevhodných leadov</li>}
                {d.offers.filter((o) => o.status === "failed").length > 0 && <li className="text-red-300">Zlyhalo {d.offers.filter((o) => o.status === "failed").length} behov</li>}
                {d.viewedMockups.length > 0 && (
                  <li>
                    Návrh si otvorili:{" "}
                    {d.viewedMockups.slice(0, 4).map((v, i) => (
                      <span key={v.url}>
                        {i > 0 && ", "}
                        <a href={v.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{v.company}</a> ({v.views}×)
                      </span>
                    ))}
                  </li>
                )}
                {d.replies.length > 0 && <li>Odpovedali: <b>{d.replies.map((r) => r.company).slice(0, 4).join(", ")}</b></li>}
                {(d.opens > 0 || d.clicks > 0) && <li>Maily: {d.opens} otvorení, {d.clicks} klikov</li>}
                <li className="text-muted">Minuté: {eur(d.spentSinceEur)}{d.budget.available ? `, mesiac ${eur(d.budget.spentEur)} z ${d.budget.capEur} €` : ""}</li>
              </ul>
              <p className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Čo musíš ty</p>
              {d.todo.length === 0 ? (
                <p className="text-muted">Nič, všetko je vybavené.</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.todo.map((t) => (
                    <li key={t.id}>
                      <Link href={t.href.replace(/^https?:\/\/[^/]+/, "")} className="group flex items-start gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 text-foreground transition hover:bg-white/10">
                        <span className="mt-px rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-300">{t.count}</span>
                        <span className="flex-1 leading-snug">{t.label}{t.detail && <span className="block text-[11px] text-muted">{t.detail}</span>}</span>
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 text-muted transition group-hover:text-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted/80">Každé ráno o 7:40 príde rovnaký prehľad aj na Telegram.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
