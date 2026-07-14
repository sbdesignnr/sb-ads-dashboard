"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteEditor } from "./NoteEditor";
import { cn } from "@/lib/utils";
import type { BookNoteDTO } from "@/lib/learning/store";

/** Rovnaký odhad ako na serveri — HTML značky sa do počtu slov nerátajú. */
function words(html: string): number {
  const t = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, "")
    .trim();
  return t ? t.split(/\s+/).length : 0;
}

type SaveState = "idle" | "saving" | "saved";

function Chapter({
  note,
  open,
  onToggle,
  onRename,
  onContent,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  note: BookNoteDTO;
  open: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onContent: (html: string) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [title, setTitle] = useState(note.title);
  const [state, setState] = useState<SaveState>("idle");
  const seen = useRef(note.content);

  // Názov prišiel zvonku (napr. po presune) — zosúlaď lokálne pole.
  useEffect(() => setTitle(note.title), [note.title]);

  const handleContent = (html: string) => {
    if (html === seen.current) return; // editor hlási aj zmeny, ktoré nič nezmenili
    seen.current = html;
    setState("saving");
    onContent(html);
    // Uloženie je rýchle; hlásku "Uložené" necháme chvíľu svietiť, nech ju stihneš vidieť.
    setTimeout(() => setState("saved"), 400);
    setTimeout(() => setState("idle"), 2200);
  };

  const count = words(note.content);

  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 cursor-pointer rounded p-1 text-muted hover:text-foreground"
          aria-label={open ? "Zbaliť" : "Rozbaliť"}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {open ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() =>
              title.trim() && title !== note.title && onRename(title.trim())
            }
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
            placeholder="Názov kapitoly"
            className="h-8 flex-1 text-sm font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <span className="truncate text-sm font-medium text-foreground">
              {note.title}
            </span>
            <span className="ml-2 text-xs text-muted">
              {count ? `${count} slov` : "prázdne"}
            </span>
          </button>
        )}

        <span className="flex shrink-0 items-center gap-0.5">
          {open && state !== "idle" && (
            <span
              className={cn(
                "mr-1 flex items-center gap-1 text-[11px]",
                state === "saved" ? "text-success" : "text-muted",
              )}
            >
              {state === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Ukladám
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" /> Uložené
                </>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Posunúť vyššie"
            className="cursor-pointer rounded p-1 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Posunúť nižšie"
            className="cursor-pointer rounded p-1 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Zmazať kapitolu"
            className="cursor-pointer rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {open && (
        <div className="px-2 pb-2">
          {/* `key` viaže editor na kapitolu — bez neho by sa pri prepnutí kapitoly
              znovu použil ten istý editor aj s cudzím obsahom. */}
          <NoteEditor
            key={note.id}
            content={note.content}
            onChange={handleContent}
          />
        </div>
      )}
    </div>
  );
}

export function BookNotes({ bookId }: { bookId: string }) {
  const [notes, setNotes] = useState<BookNoteDTO[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(`/api/learning/${bookId}/notes`).then((r) =>
        r.json(),
      );
      setNotes(j.notes ?? []);
    } catch {
      toast.error("Poznámky sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  const addChapter = async () => {
    setAdding(true);
    try {
      const r = await fetch(`/api/learning/${bookId}/notes`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) throw new Error();
      setNotes((n) => [...n, j.note]);
      setOpenId(j.note.id); // novú kapitolu rovno otvor, nech môžeš písať
    } catch {
      toast.error("Kapitolu sa nepodarilo pridať.");
    } finally {
      setAdding(false);
    }
  };

  const patch = async (id: string, body: Partial<BookNoteDTO>) => {
    // Prekresli hneď — písanie nesmie čakať na sieť.
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, ...body } : x)));
    const r = await fetch(`/api/learning/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      toast.error("Poznámka sa neuložila.");
      await load(); // vráť sa k tomu, čo naozaj je na serveri
    }
  };

  const remove = async (id: string) => {
    const n = notes.find((x) => x.id === id);
    if (
      !window.confirm(
        `Zmazať kapitolu „${n?.title}"? Poznámky v nej sa stratia.`,
      )
    )
      return;
    setNotes((list) => list.filter((x) => x.id !== id));
    const r = await fetch(`/api/learning/notes/${id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Kapitolu sa nepodarilo zmazať.");
      await load();
    }
  };

  // Presun = prehodenie poradia so susedom. Obom sa prepíše sortOrder, aby to
  // sedelo aj po znovunačítaní.
  const move = async (id: string, dir: -1 | 1) => {
    const i = notes.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= notes.length) return;
    const next = [...notes];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((n, idx) => ({ ...n, sortOrder: idx + 1 }));
    setNotes(renumbered);
    await Promise.all(
      [renumbered[i], renumbered[j]].map((n) =>
        fetch(`/api/learning/notes/${n.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sortOrder: n.sortOrder }),
        }),
      ),
    );
  };

  const totalWords = notes.reduce((s, n) => s + words(n.content), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Poznámky po kapitolách
          {notes.length > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal">
              {notes.length}{" "}
              {notes.length === 1
                ? "kapitola"
                : notes.length < 5
                  ? "kapitoly"
                  : "kapitol"}
              {totalWords > 0 && ` · ${totalWords} slov`}
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={addChapter}
          disabled={adding}
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Pridať kapitolu
        </Button>
      </div>

      {loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
      ) : notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted">
          Zatiaľ žiadne poznámky. Pridaj prvú kapitolu a píš — odrážky, zoznam
          na odškrtávanie,
          <br className="hidden sm:block" /> päť farieb zvýrazňovača.
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((n, i) => (
            <Chapter
              key={n.id}
              note={n}
              open={openId === n.id}
              onToggle={() => setOpenId(openId === n.id ? null : n.id)}
              onRename={(title) => patch(n.id, { title })}
              onContent={(content) => patch(n.id, { content })}
              onDelete={() => remove(n.id)}
              onMove={(d) => move(n.id, d)}
              isFirst={i === 0}
              isLast={i === notes.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
