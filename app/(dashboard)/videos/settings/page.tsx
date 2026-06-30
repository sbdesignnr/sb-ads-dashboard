"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, Loader2, Tag, Youtube } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, type CategoryDTO, type ChannelDTO } from "@/lib/youtube/types";

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-6 w-6 rounded-full border transition-transform hover:scale-110 cursor-pointer",
            value === c ? "border-foreground ring-2 ring-offset-2 ring-offset-surface" : "border-border",
          )}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

export default function VideoSettingsPage() {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);
  const [editCat, setEditCat] = useState<{ id: string; name: string; color: string } | null>(null);

  const [channelInput, setChannelInput] = useState("");
  const [channelCat, setChannelCat] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [c, ch] = await Promise.all([
      fetch("/api/videos/categories").then((r) => r.json()),
      fetch("/api/videos/channels").then((r) => r.json()),
    ]);
    setCategories(c.categories ?? []);
    setChannels(ch.channels ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    await fetch("/api/videos/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newCatColor }),
    });
    setNewCatName("");
    setNewCatColor(CATEGORY_COLORS[0]);
    load();
  };

  const saveCategory = async () => {
    if (!editCat) return;
    await fetch(`/api/videos/categories/${editCat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editCat.name, color: editCat.color }),
    });
    setEditCat(null);
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm("Vymazať kategóriu? Kanály ostanú, len bez kategórie.")) return;
    await fetch(`/api/videos/categories/${id}`, { method: "DELETE" });
    load();
  };

  const addChannel = async () => {
    const input = channelInput.trim();
    if (!input) return;
    setAdding(true);
    try {
      const res = await fetch("/api/videos/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, categoryId: channelCat || null }),
      });
      const j = await res.json();
      if (res.ok && j.channel) {
        toast.success(`Pridaný kanál: ${j.channel.channelName}`);
        setChannelInput("");
        load();
      } else {
        toast.error(j.error || "Kanál sa nepodarilo pridať");
      }
    } catch {
      toast.error("Kanál sa nepodarilo pridať");
    } finally {
      setAdding(false);
    }
  };

  const reassignChannel = async (id: string, categoryId: string) => {
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, categoryId: categoryId || null } : c)));
    await fetch(`/api/videos/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: categoryId || null }),
    });
  };

  const removeChannel = async (id: string) => {
    await fetch(`/api/videos/channels/${id}`, { method: "DELETE" });
    setChannels((cs) => cs.filter((c) => c.id !== id));
  };

  const selectClass =
    "h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/videos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Späť na videá
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Videá — nastavenia</h1>
          <p className="text-sm text-muted">Spravuj YouTube kanály a kategórie.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Categories */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Kategórie</CardTitle>
              <p className="text-sm text-muted">Rozdeľ kanály do vlastných kategórií</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <LoadingRow />
            ) : categories.length === 0 ? (
              <p className="py-2 text-sm text-muted">Zatiaľ žiadne kategórie.</p>
            ) : (
              categories.map((c) =>
                editCat?.id === c.id ? (
                  <div key={c.id} className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
                    <Input
                      value={editCat.name}
                      onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                      className="h-9"
                    />
                    <Swatches value={editCat.color} onChange={(color) => setEditCat({ ...editCat, color })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveCategory}>
                        <Check className="h-4 w-4" /> Uložiť
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditCat(null)}>
                        <X className="h-4 w-4" /> Zrušiť
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
                    <span className="text-xs text-muted">{c.channelCount} kanálov</span>
                    <button
                      onClick={() => setEditCat({ id: c.id, name: c.name, color: c.color })}
                      className="rounded p-1 text-muted hover:text-foreground cursor-pointer"
                      aria-label="Upraviť"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCategory(c.id)}
                      className="rounded p-1 text-muted hover:text-danger cursor-pointer"
                      aria-label="Vymazať"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ),
              )
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Názov novej kategórie (napr. Marketing)"
                className="h-9"
                onKeyDown={(e) => e.key === "Enter" && createCategory()}
              />
              <div className="flex items-center justify-between gap-2">
                <Swatches value={newCatColor} onChange={setNewCatColor} />
                <Button size="sm" onClick={createCategory} disabled={!newCatName.trim()}>
                  <Plus className="h-4 w-4" /> Pridať
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Channels */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <Youtube className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>YouTube kanály</CardTitle>
              <p className="text-sm text-muted">Pridaj cez URL alebo @handle</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
              <Input
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="https://youtube.com/@kanal alebo @kanal"
                className="h-9"
                onKeyDown={(e) => e.key === "Enter" && !adding && addChannel()}
              />
              <div className="flex items-center gap-2">
                <select value={channelCat} onChange={(e) => setChannelCat(e.target.value)} className={cn(selectClass, "flex-1")}>
                  <option value="">Bez kategórie</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={addChannel} disabled={adding || !channelInput.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Pridať
                </Button>
              </div>
            </div>

            {loading ? (
              <LoadingRow />
            ) : channels.length === 0 ? (
              <p className="py-2 text-sm text-muted">Zatiaľ žiadne kanály.</p>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                >
                  {ch.channelThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.channelThumbnail} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                      <Youtube className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{ch.channelName}</span>
                  <select
                    value={ch.categoryId ?? ""}
                    onChange={(e) => reassignChannel(ch.id, e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Bez kategórie</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeChannel(ch.id)}
                    className="rounded p-1 text-muted hover:text-danger cursor-pointer"
                    aria-label="Odstrániť"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Načítavam…
    </div>
  );
}
