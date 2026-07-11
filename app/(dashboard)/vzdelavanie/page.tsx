"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Sparkles, Star, X, Trash2, BookOpen, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Book {
  id: string;
  title: string;
  originalTitle: string | null;
  language: string | null;
  author: string;
  category: string;
  coverUrl: string | null;
  publishedYear: number | null;
  why: string;
  howToApply: string;
  takeaways: string[];
  priority: number;
  status: string;
  rating: number | null;
  notes: string;
}

const CATEGORIES = ["biznis", "predaj", "marketing", "zdravie", "mindset", "produktivita", "financie"];
const CAT_COLOR: Record<string, string> = {
  biznis: "#3b82f6",
  predaj: "#22c55e",
  marketing: "#ec4899",
  zdravie: "#14b8a6",
  mindset: "#8b5cf6",
  produktivita: "#f97316",
  financie: "#eab308",
};

function Cover({ book, className }: { book: Book; className?: string }) {
  const [failed, setFailed] = useState(false);
  const color = CAT_COLOR[book.category] ?? "#64748b";
  if (book.coverUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={book.coverUrl}
        alt={book.title}
        onError={() => setFailed(true)}
        className={cn("h-full w-full object-cover", className)}
        loading="lazy"
      />
    );
  }
  // Placeholder "spine" when no real cover exists.
  return (
    <div
      className={cn("flex h-full w-full flex-col justify-between p-3 text-white", className)}
      style={{ background: `linear-gradient(150deg, ${color}, ${color}99)` }}
    >
      <BookOpen className="h-4 w-4 opacity-70" />
      <div>
        <p className="line-clamp-4 text-sm font-semibold leading-tight">{book.title}</p>
        <p className="mt-1 text-[11px] opacity-80">{book.author}</p>
      </div>
    </div>
  );
}

function Stars({ value, onSet }: { value: number | null; onSet?: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={onSet ? () => onSet(n) : undefined}
          className={onSet ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} hviezd`}
        >
          <Star className={cn("h-4 w-4", value && n <= value ? "fill-warning text-warning" : "text-muted")} />
        </button>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { want: "Chcem prečítať", reading: "Čítam", read: "Prečítané", skipped: "Preskočené" };

function BookModal({
  book,
  onClose,
  onStatus,
  onNotes,
  onRating,
  onDelete,
}: {
  book: Book;
  onClose: () => void;
  onStatus: (id: string, s: string) => void;
  onNotes: (id: string, notes: string) => void;
  onRating: (id: string, n: number) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState(book.notes);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 my-4 w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label="Zavrieť"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div className="mx-auto h-52 w-36 shrink-0 overflow-hidden rounded-lg shadow-lg sm:mx-0">
            <Cover book={book} />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="default" style={{ borderColor: `${CAT_COLOR[book.category]}55` }}>
              {book.category}
            </Badge>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{book.title}</h2>
            <p className="text-sm text-muted">
              {book.author}
              {book.publishedYear ? ` · ${book.publishedYear}` : ""}
            </p>
            {book.originalTitle && book.originalTitle !== book.title && (
              <p className="mt-0.5 text-xs text-muted">
                {book.language === "SK" ? "Slovenské" : book.language === "CZ" ? "České" : ""} vydanie · originál: {book.originalTitle}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {(["want", "reading", "read"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={book.status === s ? "default" : "secondary"}
                  onClick={() => onStatus(book.id, s)}
                >
                  {book.status === s && <Check className="h-3.5 w-3.5" />}
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
            {book.status === "read" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                Hodnotenie: <Stars value={book.rating} onSet={(n) => onRating(book.id, n)} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-border p-5 sm:p-6">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Prečo si to prečítať</p>
            <p className="text-sm text-foreground">{book.why}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Ako to aplikovať</p>
            <p className="text-sm text-foreground">{book.howToApply}</p>
          </div>
          {book.takeaways.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Hlavné ponaučenia</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {book.takeaways.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Moje poznámky</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== book.notes && onNotes(book.id, notes)}
              rows={4}
              placeholder="Čo si si z knihy odniesol, čo chceš vyskúšať…"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => onDelete(book.id)}
            className="inline-flex items-center gap-1.5 text-xs text-danger hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Odstrániť z knižnice
          </button>
        </div>
      </div>
    </div>
  );
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border shadow-sm transition-transform group-hover:-translate-y-1 group-hover:shadow-lg">
        <Cover book={book} />
        {book.language && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            {book.language === "en" ? "EN" : book.language}
          </span>
        )}
        {book.status === "read" && (
          <div className="absolute right-1.5 top-1.5 rounded-full bg-success p-1 text-white shadow">
            <Check className="h-3 w-3" strokeWidth={3} />
          </div>
        )}
        {book.status === "reading" && (
          <div className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[10px] font-medium text-white">
            Čítam
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground">{book.title}</p>
      <p className="line-clamp-1 text-[11px] text-muted">{book.author}</p>
    </button>
  );
}

export default function VzdelavaniePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [selected, setSelected] = useState<Book | null>(null);
  const [focus, setFocus] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/learning");
    const j = await res.json();
    setBooks(j.books ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Keep the open modal in sync with the latest data after a mutation.
  useEffect(() => {
    if (selected) {
      const fresh = books.find((b) => b.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [books, selected]);

  const recommend = async () => {
    setRecommending(true);
    toast.loading("AI vyberá knihy pre teba… (~1 min)", { id: "rec" });
    try {
      const res = await fetch("/api/learning/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusAreas: [...focus], count: 5 }),
      });
      const j = await res.json();
      if (res.ok) {
        toast.success(`Pridaných ${j.count} nových kníh do knižnice`, { id: "rec", duration: 5000 });
        await load();
      } else {
        toast.error(j.error || "Nepodarilo sa.", { id: "rec" });
      }
    } finally {
      setRecommending(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...body } : b)));
    await fetch(`/api/learning/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };
  const setStatus = (id: string, status: string) => patch(id, { status });
  const setNotes = (id: string, notes: string) => {
    patch(id, { notes });
    toast.success("Poznámka uložená", { duration: 1500 });
  };
  const setRating = (id: string, rating: number) => patch(id, { rating });
  const remove = async (id: string) => {
    if (!confirm("Odstrániť túto knihu z knižnice?")) return;
    setSelected(null);
    setBooks((prev) => prev.filter((b) => b.id !== id));
    await fetch(`/api/learning/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const toggleFocus = (c: string) =>
    setFocus((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const visible = useMemo(() => (focus.size ? books.filter((b) => focus.has(b.category)) : books), [books, focus]);
  const next = visible.filter((b) => b.status === "want").sort((a, b) => a.priority - b.priority);
  const reading = visible.filter((b) => b.status === "reading");
  const read = visible.filter((b) => b.status === "read").sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }

  const Section = ({ title, items }: { title: string; items: Book[] }) =>
    items.length ? (
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted">
          {title} <span className="text-muted/60">({items.length})</span>
        </h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {items.map((b) => (
            <BookCard key={b.id} book={b} onOpen={() => setSelected(b)} />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vzdelávanie</h1>
          <p className="text-sm text-muted">Knihy šité na mieru — prečo ich čítať a ako ich zapojiť do biznisu.</p>
        </div>
        <Button size="sm" onClick={recommend} disabled={recommending}>
          {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Odporuč mi knihy
        </Button>
      </div>

      {/* Focus / filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggleFocus(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
              focus.has(c) ? "border-transparent text-white" : "border-border text-muted hover:text-foreground",
            )}
            style={focus.has(c) ? { background: CAT_COLOR[c] } : undefined}
          >
            {c}
          </button>
        ))}
        {focus.size > 0 && (
          <button type="button" onClick={() => setFocus(new Set())} className="px-2 py-1 text-xs text-muted hover:text-foreground">
            zrušiť filter
          </button>
        )}
      </div>

      {books.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <BookOpen className="h-8 w-8 text-muted" />
            <div>
              <p className="font-medium text-foreground">Zatiaľ prázdna knižnica</p>
              <p className="text-sm text-muted">Klikni „Odporuč mi knihy" a AI ti zostaví učebný plán na mieru.</p>
            </div>
            <Button size="sm" onClick={recommend} disabled={recommending}>
              {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Odporuč mi knihy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Section title="Ďalšie na rade" items={next} />
          <Section title="Práve čítam" items={reading} />
          <Section title="Prečítané" items={read} />
          {visible.length === 0 && <p className="py-8 text-center text-sm text-muted">V tejto kategórii zatiaľ nič.</p>}
        </div>
      )}

      {selected && (
        <BookModal
          book={selected}
          onClose={() => setSelected(null)}
          onStatus={setStatus}
          onNotes={setNotes}
          onRating={setRating}
          onDelete={remove}
        />
      )}
    </div>
  );
}
