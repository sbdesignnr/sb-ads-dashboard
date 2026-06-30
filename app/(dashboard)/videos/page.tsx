"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Youtube, Settings, Bookmark, Play, Check, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SyncButton } from "@/components/videos/SyncButton";
import { formatRelativeTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import type { CategoryDTO, VideoDTO } from "@/lib/youtube/types";

type StatusFilter = "unwatched" | "all" | "saved";

const STATUS: { value: StatusFilter; label: string }[] = [
  { value: "unwatched", label: "Nepozreté" },
  { value: "all", label: "Všetky" },
  { value: "saved", label: "Uložené" },
];

export default function VideosPage() {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [videos, setVideos] = useState<VideoDTO[]>([]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("unwatched");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<VideoDTO | null>(null);

  useEffect(() => {
    fetch("/api/videos/categories")
      .then((r) => r.json())
      .then((j) => setCategories(j.categories ?? []))
      .catch(() => {});
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/videos?category=${encodeURIComponent(category)}&filter=${status}`);
      const j = await res.json();
      setVideos(j.videos ?? []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [category, status]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const openVideo = (v: VideoDTO) => {
    setPlaying(v);
    if (!v.watched) {
      setVideos((vs) => vs.map((x) => (x.id === v.id ? { ...x, watched: true } : x)));
      fetch(`/api/videos/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched: true }),
      }).catch(() => {});
    }
  };

  const toggleSave = (v: VideoDTO, e: React.MouseEvent) => {
    e.stopPropagation();
    const saved = !v.saved;
    setVideos((vs) =>
      status === "saved" && !saved
        ? vs.filter((x) => x.id !== v.id)
        : vs.map((x) => (x.id === v.id ? { ...x, saved } : x)),
    );
    fetch(`/api/videos/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved }),
    }).catch(() => {});
    toast.success(saved ? "Uložené na neskôr" : "Odstránené z uložených");
  };

  const tabs = [{ id: "all", name: "Všetko", color: "" }, ...categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Videá</h1>
          <p className="text-sm text-muted">Kurátorovaný YouTube feed z vybraných kanálov.</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton onDone={loadVideos} />
          <Link
            href="/videos/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            <Settings className="h-4 w-4" />
            Nastavenia
          </Link>
        </div>
      </div>

      {/* Category tabs (horizontally scrollable on mobile) */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setCategory(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              category === t.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {t.color && <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
            {t.name}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
        {STATUS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              status === s.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Načítavam videá…
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <Youtube className="h-6 w-6" />
            </div>
            <p className="max-w-md text-sm text-muted">
              {status === "saved"
                ? "Zatiaľ nemáš uložené žiadne videá."
                : "Žiadne videá. Pridaj kanály v nastaveniach a stlač „Obnoviť“."}
            </p>
            <Link
              href="/videos/settings"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Settings className="h-4 w-4" />
              Spravovať kanály
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <div
              key={v.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/40"
            >
              <button onClick={() => openVideo(v)} className="relative block aspect-video w-full cursor-pointer">
                {v.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-surface-2 text-muted">
                    <Youtube className="h-8 w-8" />
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/90 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                </span>
                {v.duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                    {v.duration}
                  </span>
                )}
                {v.watched && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-success">
                    <Check className="h-3 w-3" />
                    Pozreté
                  </span>
                )}
                <button
                  onClick={(e) => toggleSave(v, e)}
                  className={cn(
                    "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 transition-colors hover:bg-black/90 cursor-pointer",
                    v.saved ? "text-primary" : "text-white",
                  )}
                  aria-label="Uložiť na neskôr"
                >
                  <Bookmark className={cn("h-4 w-4", v.saved && "fill-current")} />
                </button>
              </button>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <button onClick={() => openVideo(v)} className="text-left cursor-pointer">
                  <p className="line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary">{v.title}</p>
                </button>
                <div className="mt-auto flex items-center gap-2">
                  {v.channelThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.channelThumbnail} alt="" className="h-5 w-5 shrink-0 rounded-full" />
                  ) : null}
                  <span className="truncate text-xs text-muted">{v.channelName}</span>
                  <span className="text-muted">·</span>
                  <span className="shrink-0 text-xs text-muted">{formatRelativeTime(v.publishedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Player modal */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPlaying(null)}
        >
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{playing.title}</p>
              <button
                onClick={() => setPlaying(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                aria-label="Zavrieť"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0`}
                title={playing.title}
                className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
