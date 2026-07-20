"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FileText, Save, ChevronDown, Loader2, Settings2 } from "lucide-react";
import { fillTemplate, type EmailTemplateDTO, type TemplateVars } from "@/lib/leads/templates";
import { cn } from "@/lib/utils";

/**
 * Lišta šablón nad editorom mailu. Vloží uloženú šablónu (so zástupnými značkami
 * nahradenými údajmi leadu) alebo uloží aktuálny mail ako novú šablónu.
 */
export function TemplateBar({
  subject,
  body,
  vars,
  onInsert,
}: {
  subject: string;
  body: string;
  vars: TemplateVars;
  /** Dostane hotový predmet + telo (značky už nahradené). */
  onInsert: (subject: string, body: string) => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplateDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const j = await fetch("/api/leads/templates").then((r) => r.json());
      setTemplates(j.templates ?? []);
    } catch {
      /* ticho */
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Zatvor dropdown pri kliknutí mimo.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const insert = (t: EmailTemplateDTO) => {
    onInsert(fillTemplate(t.subject, vars), fillTemplate(t.body, vars));
    setOpen(false);
    toast.success(`Vložená šablóna „${t.name}"`);
    // Zapíš použitie (na zoradenie), bez čakania.
    fetch(`/api/leads/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incrementUse: true }),
    }).catch(() => {});
  };

  const saveAsTemplate = async () => {
    if (!body.trim()) return toast.error("Telo mailu je prázdne.");
    const name = window.prompt("Názov šablóny (napr. Prvý kontakt – reštaurácie):", "");
    if (!name?.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/leads/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), subject, body }),
      });
      if (!r.ok) throw new Error();
      toast.success("Uložené ako šablóna");
      await load();
    } catch {
      toast.error("Šablónu sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2"
        >
          <FileText className="h-3.5 w-3.5" />
          Vložiť šablónu
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
            {!loaded ? (
              <p className="px-2 py-3 text-center text-xs text-muted">Načítavam…</p>
            ) : templates.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted">
                Zatiaľ žiadne šablóny. Napíš mail a klikni „Uložiť ako šablónu".
              </p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => insert(t)}
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                    {t.useCount > 0 && <span className="shrink-0 text-[10px] text-muted">{t.useCount}×</span>}
                  </span>
                  {t.subject && <span className="truncate text-xs text-muted">{t.subject}</span>}
                </button>
              ))
            )}
            <Link
              href="/leads/sablony"
              className="mt-1 flex items-center gap-1.5 border-t border-border px-2 py-1.5 text-xs text-muted hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Spravovať šablóny
            </Link>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={saveAsTemplate}
        disabled={saving}
        className={cn(
          "inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50",
        )}
        title="Uložiť tento mail ako šablónu na ďalšie použitie"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Uložiť ako šablónu
      </button>
    </div>
  );
}
