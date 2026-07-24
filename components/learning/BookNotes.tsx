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
  Camera,
  X,
  Sparkles,
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

const MAX_PHOTOS = 15;

/**
 * Zmenší fotku na max 1568 px (dlhšia strana) a prekonvertuje na JPEG blob — text
 * na strane knihy ostane čitateľný, ale payload je malý (bez base64 nafúknutia,
 * lebo posielame multipart). Vráti null, keď sa obrázok nedá načítať (napr. HEIC
 * na desktope).
 */
async function resizePhoto(
  file: File,
  maxEdge = 1568,
  quality = 0.72,
): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("load_failed"));
      im.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Panel na nahranie fotiek strán knihy → AI z nich spraví poznámky (kapitolu). */
function PhotoImport({
  bookId,
  onCreated,
  onClose,
}: {
  bookId: string;
  onCreated: (note: BookNoteDTO) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => {
      const merged = [...prev, ...imgs].slice(0, MAX_PHOTOS);
      if (prev.length + imgs.length > MAX_PHOTOS)
        toast(`Naraz max ${MAX_PHOTOS} fotiek.`);
      return merged;
    });
    setPreviews((prev) =>
      [...prev, ...imgs.map((f) => URL.createObjectURL(f))].slice(
        0,
        MAX_PHOTOS,
      ),
    );
  };

  const removeAt = (i: number) => {
    setFiles((f) => f.filter((_, idx) => idx !== i));
    setPreviews((p) => {
      URL.revokeObjectURL(p[i]);
      return p.filter((_, idx) => idx !== i);
    });
  };

  const submit = async () => {
    if (!files.length) return toast.error("Pridaj aspoň jednu fotku.");
    setBusy(true);
    const id = "photo-notes";
    toast.loading(`Zmenšujem ${files.length} fotiek…`, { id });
    try {
      // Adaptívne: zmenšuj, kým celok nie je pod rozpočtom (Vercel má limit ~4,5 MB
      // na telo requestu). Text na strane pritom ostane čitateľný.
      const BUDGET = 3.6 * 1024 * 1024;
      const STEPS = [
        { edge: 1500, q: 0.72 },
        { edge: 1500, q: 0.6 },
        { edge: 1400, q: 0.52 },
        { edge: 1280, q: 0.45 },
      ];
      let blobs: Blob[] = [];
      for (let s = 0; s < STEPS.length; s++) {
        blobs = [];
        for (const f of files) {
          const b = await resizePhoto(f, STEPS[s].edge, STEPS[s].q);
          if (b) blobs.push(b);
        }
        const total = blobs.reduce((sum, b) => sum + b.size, 0);
        if (total <= BUDGET || s === STEPS.length - 1) break;
      }
      if (!blobs.length) {
        toast.error("Fotky sa nepodarilo spracovať (skús JPG/PNG).", { id });
        return;
      }

      const form = new FormData();
      if (title.trim()) form.append("title", title.trim());
      blobs.forEach((b, i) => form.append("photos", b, `page-${i + 1}.jpg`));

      toast.loading(
        `AI číta ${blobs.length} fotiek a píše poznámky… (môže to trvať aj 1-2 minúty)`,
        { id },
      );
      const r = await fetch(`/api/learning/${bookId}/notes/from-photos`, {
        method: "POST",
        body: form,
      });

      // Chyba nemusí byť JSON (413 od platformy, 504 timeout) — prečítaj bezpečne.
      const ct = r.headers.get("content-type") ?? "";
      const j = ct.includes("application/json")
        ? await r.json().catch(() => null)
        : null;
      if (!r.ok) {
        const msg =
          j?.message ||
          j?.error ||
          (r.status === 413
            ? "Fotky sú príliš veľké. Skús menej fotiek naraz."
            : r.status === 504 || r.status === 502
              ? "Trvalo to príliš dlho. Skús menej fotiek naraz (napr. 6-8)."
              : `Nepodarilo sa vytvoriť poznámky (chyba ${r.status}).`);
        toast.error(msg, { id });
        return;
      }
      if (!j?.note) {
        toast.error("Server vrátil neočakávanú odpoveď.", { id });
        return;
      }
      toast.success("Poznámky vytvorené!", { id });
      previews.forEach((u) => URL.revokeObjectURL(u));
      onCreated(j.note);
    } catch (e) {
      toast.error(`Nepodarilo sa vytvoriť poznámky: ${(e as Error).message}`, {
        id,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Camera className="h-4 w-4 text-primary" />
          Poznámky z fotiek
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-foreground"
          aria-label="Zavrieť"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 text-xs text-muted">
        Odfoť strany knihy so zvýraznenými pasážami (max {MAX_PHOTOS} naraz) a
        AI z nich spraví premakané poznámky aj s krokmi, ako to použiť v
        biznise. Pre ďalšiu kapitolu pošli novú dávku.
      </p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Názov kapitoly / téma (nepovinné) — napr. „1. kapitola: Návyky"
        className="mb-2"
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = ""; // nech sa dá pridať tá istá fotka znova
        }}
      />

      {previews.length > 0 && (
        <div className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {previews.map((src, i) => (
            <div
              key={src}
              className="group relative aspect-[3/4] overflow-hidden rounded border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`strana ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Odobrať"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Camera className="h-3.5 w-3.5" />
          {previews.length
            ? `Pridať ďalšie (${previews.length}/${MAX_PHOTOS})`
            : "Vybrať fotky"}
        </Button>
        <Button size="sm" onClick={submit} disabled={busy || !files.length}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Vytvoriť poznámky
        </Button>
      </div>
    </div>
  );
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
  const [photoMode, setPhotoMode] = useState(false);

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setPhotoMode((v) => !v)}
            disabled={adding}
          >
            <Camera className="h-3.5 w-3.5" />Z fotiek
          </Button>
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
      </div>

      {photoMode && (
        <div className="mb-3">
          <PhotoImport
            bookId={bookId}
            onClose={() => setPhotoMode(false)}
            onCreated={(note) => {
              setNotes((n) => [...n, note]);
              setOpenId(note.id);
              setPhotoMode(false);
            }}
          />
        </div>
      )}

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
