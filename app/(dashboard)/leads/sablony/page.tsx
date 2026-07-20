"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileText,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TEMPLATE_PLACEHOLDERS,
  type EmailTemplateDTO,
} from "@/lib/leads/templates";

function Editor({
  template,
  onSaved,
  onCancel,
}: {
  template: EmailTemplateDTO | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Zadaj názov šablóny.");
    if (!body.trim()) return toast.error("Telo šablóny je prázdne.");
    setSaving(true);
    try {
      const url = template
        ? `/api/leads/templates/${template.id}`
        : "/api/leads/templates";
      const r = await fetch(url, {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), subject, body }),
      });
      if (!r.ok) throw new Error();
      toast.success(template ? "Uložené" : "Šablóna vytvorená");
      onSaved();
    } catch {
      toast.error("Uloženie zlyhalo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            {template ? "Upraviť šablónu" : "Nová šablóna"}
          </h2>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Názov (napr. Prvý kontakt – reštaurácie)"
        />
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Predmet (voliteľný)"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder="Text mailu…"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Značky (nahradia sa údajmi leadu):</span>
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <button
              key={p.token}
              type="button"
              onClick={() => setBody((b) => b + p.token)}
              className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-foreground hover:bg-surface-2"
              title={`Vložiť: ${p.label}`}
            >
              {p.token}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Uložiť
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplateDTO | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/leads/templates").then((r) => r.json());
      setTemplates(j.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (t: EmailTemplateDTO) => {
    if (!window.confirm(`Zmazať šablónu „${t.name}"?`)) return;
    setTemplates((list) => list.filter((x) => x.id !== t.id));
    await fetch(`/api/leads/templates/${t.id}`, { method: "DELETE" });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/leads/kampane"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">
            Šablóny mailov
          </h1>
          <p className="text-sm text-muted">
            Uložené texty, ktoré vieš vložiť do ktoréhokoľvek mailu v kampani.
          </p>
        </div>
        {editing === null && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Nová šablóna
          </Button>
        )}
      </div>

      {editing !== null && (
        <Editor
          template={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      ) : templates.length === 0 && editing === null ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-2 text-sm text-muted">
              Zatiaľ žiadne šablóny. Vytvor prvú alebo v kampani klikni „Uložiť
              ako šablónu".
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {t.name}
                  </span>
                  {t.useCount > 0 && (
                    <span className="shrink-0 text-xs text-muted">
                      použité {t.useCount}×
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted">
                  {t.subject || t.body.slice(0, 80)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label="Zmazať"
                className="shrink-0 rounded p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
