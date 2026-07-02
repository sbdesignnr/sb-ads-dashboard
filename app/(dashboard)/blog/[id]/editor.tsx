"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Save,
  Send,
  Trash2,
  Eye,
  Pencil,
  Loader2,
  Globe,
  Undo2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link2,
  Plus,
  Sparkles,
  Wand2,
  BarChart3,
  Clock,
  LogOut,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ai/Markdown";
import { TrafficChart } from "@/components/blog/TrafficChart";
import { analyzeSeo, type CheckStatus, type LinkSuggestion } from "@/lib/blog/analyze";
import { cn } from "@/lib/utils";
import type { BlogPostDTO } from "@/lib/blog/types";
import type { ArticlePerformance } from "@/lib/blog/ga4";

const SCORE_BG: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

const STATUS_ICON: Record<CheckStatus, { Icon: typeof CheckCircle2; cls: string }> = {
  ok: { Icon: CheckCircle2, cls: "text-success" },
  warn: { Icon: AlertTriangle, cls: "text-warning" },
  error: { Icon: XCircle, cls: "text-danger" },
};

function metaHint(len: number, lo: number, hi: number): { t: string; c: string } | null {
  if (len === 0) return null;
  if (len < lo) return { t: "krátke", c: "text-warning" };
  if (len > hi) return { t: "dlhé", c: "text-danger" };
  return { t: "OK", c: "text-success" };
}

const STATUS_ORDER: Record<CheckStatus, number> = { error: 0, warn: 1, ok: 2 };

/** Expand a caret position to the surrounding paragraph (between blank lines). */
function paragraphRange(text: string, pos: number): [number, number] {
  const before = text.lastIndexOf("\n\n", Math.max(0, pos - 1));
  const start = before === -1 ? 0 : before + 2;
  const after = text.indexOf("\n\n", pos);
  const end = after === -1 ? text.length : after;
  return [start, end];
}

interface MetaSug {
  titles: string[];
  descriptions: string[];
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function PerfStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted" />
      <p className="text-base font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function LabeledField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function BlogEditor({ id }: { id: string }) {
  const router = useRouter();
  const [post, setPost] = useState<BlogPostDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [otherPosts, setOtherPosts] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaSug, setMetaSug] = useState<MetaSug | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [generatingFull, setGeneratingFull] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [perf, setPerf] = useState<ArticlePerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/blog/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active || !j.post) return;
        const p = j.post as BlogPostDTO;
        setPost(p);
        setTitle(p.title);
        setContent(p.content);
        setSlug(p.slug);
        setCategory(p.category ?? "");
        setTargetKeyword(p.targetKeyword ?? "");
        setMetaTitle(p.metaTitle ?? "");
        setMetaDescription(p.metaDescription ?? "");
        setImageUrl(p.imageUrl ?? "");
        setImageAlt(p.imageAlt ?? "");
        setStatus(p.status);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    fetch("/api/blog")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.posts ?? []) as BlogPostDTO[];
        setOtherPosts(
          list
            .filter((p) => p.id !== id && p.title.trim())
            .map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
        );
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (status !== "published") {
      setPerf(null);
      return;
    }
    let active = true;
    setPerfLoading(true);
    fetch(`/api/blog/${id}/metrics`)
      .then((r) => r.json())
      .then((j) => {
        if (active && j?.metrics) setPerf(j as ArticlePerformance);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setPerfLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, status]);

  const analysis = useMemo(
    () =>
      analyzeSeo({ title, content, metaTitle, metaDescription, targetKeyword, imageUrl, imageAlt, otherPosts }),
    [title, content, metaTitle, metaDescription, targetKeyword, imageUrl, imageAlt, otherPosts],
  );
  const seo = analysis.score;
  const words = analysis.words;

  const insertLink = (s: LinkSuggestion) =>
    setContent((c) => `${c.replace(/\s+$/, "")}\n\n[${s.title}](/blog/${s.slug})\n`);

  const genMeta = async () => {
    if (!content.trim()) {
      toast.error("Najprv napíš obsah článku");
      return;
    }
    setMetaLoading(true);
    try {
      const res = await fetch("/api/blog/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, targetKeyword }),
      });
      const j = await res.json();
      if (res.ok && (j.titles?.length || j.descriptions?.length)) {
        setMetaSug({ titles: j.titles ?? [], descriptions: j.descriptions ?? [] });
      } else {
        toast.error("Generovanie meta zlyhalo");
      }
    } catch {
      toast.error("Generovanie meta zlyhalo");
    } finally {
      setMetaLoading(false);
    }
  };

  const rewriteSelection = async () => {
    const ta = taRef.current;
    let start = ta?.selectionStart ?? 0;
    let end = ta?.selectionEnd ?? 0;
    if (start === end) [start, end] = paragraphRange(content, start);
    const text = content.slice(start, end).trim();
    if (!text) {
      toast.error("Označ text alebo klikni do odseku, ktorý chceš vylepšiť");
      return;
    }
    setRewriting(true);
    try {
      const res = await fetch("/api/blog/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, instruction, targetKeyword, title }),
      });
      const j = await res.json();
      if (res.ok && j.text) {
        setContent(content.slice(0, start) + j.text + content.slice(end));
        toast.success("Text vylepšený");
      } else {
        toast.error("Vylepšenie zlyhalo");
      }
    } catch {
      toast.error("Vylepšenie zlyhalo");
    } finally {
      setRewriting(false);
    }
  };

  const generateFull = async () => {
    if (!title.trim()) {
      toast.error("Najprv zadaj názov / tému článku");
      return;
    }
    if (content.trim() && !confirm("Prepísať súčasný obsah kompletným AI článkom?")) return;
    setGeneratingFull(true);
    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, targetKeyword, category }),
      });
      const j = await res.json();
      if (res.ok && j.article) {
        const a = j.article;
        setContent(a.content);
        if (a.metaTitle) setMetaTitle(a.metaTitle);
        if (a.metaDescription) setMetaDescription(a.metaDescription);
        if (a.imageAlt && !imageAlt) setImageAlt(a.imageAlt);
        if (a.title && a.title !== title) setTitle(a.title);
        if (a.slug && !slug) setSlug(a.slug);
        if (a.targetKeyword && !targetKeyword) setTargetKeyword(a.targetKeyword);
        toast.success("Článok vygenerovaný — skontroluj a ulož");
      } else {
        toast.error(j.error || "Generovanie zlyhalo");
      }
    } catch {
      toast.error("Generovanie zlyhalo");
    } finally {
      setGeneratingFull(false);
    }
  };

  const save = async (publish?: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/blog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          slug,
          category,
          targetKeyword,
          metaTitle,
          metaDescription,
          imageUrl,
          imageAlt,
          ...(publish !== undefined ? { status: publish ? "published" : "draft" } : {}),
        }),
      });
      const j = await res.json();
      if (j.post) {
        setPost(j.post);
        setSlug(j.post.slug);
        setStatus(j.post.status);
        toast.success(publish === true ? "Publikované" : publish === false ? "Vrátené na koncept" : "Uložené");
      } else {
        toast.error("Uloženie zlyhalo");
      }
    } catch {
      toast.error("Uloženie zlyhalo");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Naozaj vymazať tento článok?")) return;
    await fetch(`/api/blog/${id}`, { method: "DELETE" });
    router.push("/blog");
  };

  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vyber obrázok.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Obrázok je príliš veľký (max 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/blog/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (res.ok && j.url) {
        setImageUrl(j.url);
        toast.success("Obrázok nahraný");
      } else {
        toast.error(j.error || "Upload zlyhal — vlož obrázok ako URL.");
      }
    } catch {
      toast.error("Upload zlyhal — vlož obrázok ako URL.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }
  if (!post) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        Článok nenájdený.{" "}
        <Link href="/blog" className="text-primary hover:underline">
          Späť na zoznam
        </Link>
      </div>
    );
  }

  const color = analysis.color;
  const sortedChecks = [...analysis.checks].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );
  const issues = analysis.checks.filter((c) => c.status !== "ok").length;
  const mtH = metaHint(metaTitle.length, 50, 60);
  const mdH = metaHint(metaDescription.length, 150, 160);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Späť
        </Link>
        {status === "published" ? (
          <Badge variant="success">Publikované</Badge>
        ) : (
          <Badge variant="warning">Koncept</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={del} className="text-danger hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Uložiť
          </Button>
          {status === "published" ? (
            <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
              <Undo2 className="h-4 w-4" />
              Späť na koncept
            </Button>
          ) : (
            <Button size="sm" onClick={() => save(true)} disabled={saving}>
              <Send className="h-4 w-4" />
              Publikovať
            </Button>
          )}
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Názov článku"
        className="h-12 text-lg font-semibold"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface-2 p-1">
            <button
              onClick={() => setTab("edit")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer",
                tab === "edit" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Pencil className="h-4 w-4" />
              Editor
            </button>
            <button
              onClick={() => setTab("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer",
                tab === "preview" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Eye className="h-4 w-4" />
              Náhľad
            </button>
          </div>

          {tab === "edit" ? (
            <>
              <textarea
                ref={taRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"Píš v Markdowne…\n\n# Hlavný nadpis (H1)\n\n## Podnadpis (H2)\n\nText odseku…"}
                className="min-h-[520px] w-full rounded-xl border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 p-2">
                <Input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Inštrukcia pre AI (voliteľné, napr. „skráť a sprehľadni“)"
                  className="h-9 min-w-[160px] flex-1"
                />
                <Button variant="secondary" size="sm" onClick={rewriteSelection} disabled={rewriting}>
                  {rewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Vylepšiť výber / odsek
                </Button>
                <Button size="sm" onClick={generateFull} disabled={generatingFull}>
                  {generatingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Vygenerovať celý článok
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="min-h-[520px] py-5">
                <Markdown>{content || "_Zatiaľ prázdne — prepni na Editor a začni písať._"}</Markdown>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted">
            {words} slov · Tip: označ text alebo klikni do odseku a stlač „Vylepšiť“.
          </p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO skóre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold tabular-nums",
                    SCORE_BG[color],
                  )}
                >
                  {seo}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {seo >= 80 ? "Výborné" : seo >= 50 ? "Dá sa zlepšiť" : "Slabé"}
                  </p>
                  <p className="text-xs text-muted">
                    {issues === 0 ? "Všetko v poriadku 🎉" : `${issues} vec${issues === 1 ? "" : "í"} na zlepšenie`}
                  </p>
                </div>
              </div>

              {issues > 0 && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Čo opraviť</p>
              )}
              <ul className="space-y-2">
                {sortedChecks.map((c) => {
                  const { Icon, cls } = STATUS_ICON[c.status];
                  return (
                    <li key={c.id} className="flex items-start gap-2">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{c.label}</p>
                        <p className="text-xs text-muted">{c.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {analysis.internalLinkSuggestions.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium text-foreground">
                    <Link2 className="h-3.5 w-3.5" />
                    Navrhované interné odkazy
                  </p>
                  <div className="space-y-1.5">
                    {analysis.internalLinkSuggestions.map((s) => (
                      <button
                        key={s.slug}
                        onClick={() => insertLink(s)}
                        className="flex w-full items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-left text-xs text-muted transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
                      >
                        <Plus className="h-3 w-3 shrink-0 text-primary" />
                        <span className="truncate">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cover obrázok</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {imageUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={imageAlt || "Náhľad cover obrázka"}
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                  />
                  <button
                    onClick={() => setImageUrl("")}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-danger cursor-pointer"
                    aria-label="Odstrániť obrázok"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => coverInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    uploadCover(e.dataTransfer.files?.[0]);
                  }}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/40"
                >
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted" />
                  )}
                  <p className="text-xs text-muted">
                    Pretiahni obrázok sem alebo klikni pre nahranie
                    <br />
                    (JPG/PNG/WebP, max 5 MB)
                  </p>
                </div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => {
                  uploadCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <LabeledField label="alebo URL obrázka">
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
              </LabeledField>
              <LabeledField label="Alt text obrázku (popis pre SEO a prístupnosť)">
                <Input
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder="napr. Webdesignér pracujúci na firemnom webe"
                />
              </LabeledField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nastavenia & SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <LabeledField label="URL slug">
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="url-clanku" />
              </LabeledField>
              <LabeledField label="Kategória">
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="napr. SEO" />
              </LabeledField>
              <LabeledField label="Cieľové kľúčové slovo">
                <Input
                  value={targetKeyword}
                  onChange={(e) => setTargetKeyword(e.target.value)}
                  placeholder="napr. tvorba web stránok"
                />
              </LabeledField>
              <LabeledField
                label={
                  <span className="flex items-center justify-between">
                    Meta title
                    <span className="font-normal">
                      <span className="text-muted">{metaTitle.length}/60</span>
                      {mtH && <span className={cn("ml-1", mtH.c)}>· {mtH.t}</span>}
                    </span>
                  </span>
                }
              >
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              </LabeledField>
              <LabeledField
                label={
                  <span className="flex items-center justify-between">
                    Meta description
                    <span className="font-normal">
                      <span className="text-muted">{metaDescription.length}/160</span>
                      {mdH && <span className={cn("ml-1", mdH.c)}>· {mdH.t}</span>}
                    </span>
                  </span>
                }
              >
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </LabeledField>
              <div className="border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={genMeta}
                  disabled={metaLoading}
                >
                  {metaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Vygenerovať meta (AI)
                </Button>
                {metaSug && (
                  <div className="mt-3 space-y-3">
                    {metaSug.titles.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted">Návrhy meta title</p>
                        <div className="space-y-1.5">
                          {metaSug.titles.map((t, i) => (
                            <button
                              key={i}
                              onClick={() => setMetaTitle(t)}
                              className="flex w-full items-start justify-between gap-2 rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/40 cursor-pointer"
                            >
                              <span>{t}</span>
                              <span className="shrink-0 text-muted">{t.length}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {metaSug.descriptions.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted">Návrhy meta description</p>
                        <div className="space-y-1.5">
                          {metaSug.descriptions.map((d, i) => (
                            <button
                              key={i}
                              onClick={() => setMetaDescription(d)}
                              className="flex w-full items-start justify-between gap-2 rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/40 cursor-pointer"
                            >
                              <span>{d}</span>
                              <span className="shrink-0 text-muted">{d.length}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {status === "published" && (
                <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-success" />
                  sbdesign.sk/blog/{slug}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {status === "published" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Výkon článku</CardTitle>
                <p className="text-sm text-muted">Organická návštevnosť za 30 dní</p>
              </div>
            </div>
            {perf &&
              (perf.source === "ga4" ? (
                <Badge variant="success">Naživo z GA4</Badge>
              ) : (
                <Badge variant="default">Simulované dáta</Badge>
              ))}
          </CardHeader>
          <CardContent>
            {perfLoading && !perf ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Načítavam metriky…
              </div>
            ) : perf ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <PerfStat icon={Eye} label="Zobrazenia" value={perf.metrics.views.toLocaleString("sk-SK")} />
                  <PerfStat icon={Clock} label="Priem. čas" value={fmtDuration(perf.metrics.avgTimeSec)} />
                  <PerfStat icon={LogOut} label="Bounce rate" value={`${perf.metrics.bounceRate}%`} />
                </div>
                <TrafficChart data={perf.series} />
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">Žiadne dáta o návštevnosti.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
