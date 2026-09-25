"use client";

// Odôvodnenie Skauta (Miro) na detaile leadu: prečo je firma vhodná alebo nevhodná, s dôkazmi z dát.
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";

interface V {
  suitable: boolean;
  fit: number;
  size: string;
  service: string;
  headline: string;
  why: string;
  evidence: string[];
  risks: string[];
  rejectReason: string | null;
  at: string;
}

export function MiroVerdict({ leadId }: { leadId: string }) {
  const [v, setV] = useState<V | null>(null);
  const [notes, setNotes] = useState<{ agent: string; title: string | null; body: string | null }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/agents/verdict?leadId=${encodeURIComponent(leadId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setV(j.verdict);
        setNotes(j.notes ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leadId]);
  if (!v && notes.length === 0) return null;
  return (
    <div className="w-full rounded-xl border border-sky-400/30 bg-sky-400/[0.06] px-3.5 py-3 text-xs leading-relaxed text-foreground/90">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-500">
        <Compass className="h-3.5 w-3.5" />
        Miro: prečo {v ? (v.suitable ? "je tento lead vhodný" : "bol lead skrytý") : "takto"}
      </p>
      {v && (
        <>
          <p>
            <b>{v.suitable ? `Vhodný (${v.fit}/10)` : `Nevhodný (${v.fit}/10)`}</b> · {v.headline || v.why}
          </p>
          {v.why && v.headline && <p className="mt-1 text-muted">{v.why}</p>}
          {v.evidence?.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted">
              {v.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {v.risks?.length > 0 && <p className="mt-1.5 text-muted">Riziká: {v.risks.join(" · ")}</p>}
          {!v.suitable && v.rejectReason && <p className="mt-1.5 text-muted">Dôvod skrytia: {v.rejectReason}</p>}
        </>
      )}
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-sky-400/20 pt-1.5 text-muted">
          {notes.slice(0, 4).map((n, i) => (
            <li key={i}>
              {n.agent === "nora" ? "Nora" : n.agent === "user" ? "Ty" : "Miro"}: {n.title}
              {n.body ? ` (${n.body})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
