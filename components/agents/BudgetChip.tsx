"use client";

// Pokladnica agentov: koľko z mesačného rozpočtu je minuté (Claude + Google spolu).
import { useState } from "react";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetSnapshot } from "@/lib/agents/budget";

const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const NAMES: Record<string, string> = { nora: "Nora (výskum, maily)", skaut: "Miro (skaut)", atelier: "Ateliér (náhľady)", leads: "Leady (skenovanie, analýza)" };

export function BudgetChip({ budget }: { budget: BudgetSnapshot }) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(1, budget.pctUsed);
  const color = !budget.available ? "#94a3b8" : pct >= 0.9 ? "#ef4444" : pct >= 0.7 ? "#f59e0b" : "#22c55e";
  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/12 bg-[#0d1524]/80 px-3 py-2 text-xs shadow-lg backdrop-blur-md transition hover:bg-white/10"
        title="Pokladnica agentov"
      >
        <Coins className="h-3.5 w-3.5" style={{ color }} />
        {budget.available ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">{eur(budget.spentEur)}</span>
            <span className="text-muted">z {budget.capEur} €</span>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
            </span>
          </>
        ) : (
          <span className="text-muted">Pokladnica nie je zapnutá</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-white/12 bg-[#0d1524]/96 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Tento mesiac</p>
          {!budget.available ? (
            <p className="leading-relaxed text-muted">Chýba tabuľka agent_spend, preto sa výdavky zatiaľ nezapisujú a nočný režim je z bezpečnosti vypnutý.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {(Object.keys(budget.byAgent) as (keyof typeof budget.byAgent)[]).map((k) => {
                  const spent = budget.byAgent[k];
                  const alloc = budget.allocation[k];
                  return (
                    <li key={k}>
                      <div className="flex justify-between text-foreground">
                        <span>{NAMES[k]}</span>
                        <span className="tabular-nums">{eur(spent)} <span className="text-muted">/ {alloc} €</span></span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className={cn("h-full rounded-full", spent > alloc ? "bg-red-400" : "bg-sky-400")} style={{ width: `${Math.min(100, (spent / alloc) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 space-y-1 border-t border-white/10 pt-2.5 text-muted">
                <p className="flex justify-between"><span>Dnes</span><span className="tabular-nums text-foreground">{eur(budget.todayEur)}</span></p>
                <p className="flex justify-between"><span>Claude / Google</span><span className="tabular-nums text-foreground">{eur(budget.byKind.anthropic)} / {eur(budget.byKind.places)}</span></p>
                <p className="flex justify-between"><span>Odhad do konca mesiaca</span><span className={cn("tabular-nums", budget.projectedEur > budget.capEur ? "text-red-300" : "text-foreground")}>{eur(budget.projectedEur)}</span></p>
              </div>
              <p className="mt-2.5 leading-relaxed text-muted/80">Nočné behy sa zastavia pri 90 % ({eur(budget.capEur * 0.9)}). Google sa účtuje odhadom, presnú sumu ukáže Google Cloud.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
