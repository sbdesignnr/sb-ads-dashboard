"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Save, Send, Trash2, Eye, Pencil, Loader2, Globe, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ai/Markdown";
import { computeSeoScore, seoColor, wordCount } from "@/lib/blog/seo";
import { cn } from "@/lib/utils";
import type { BlogPostDTO } from "@/lib/blog/types";

const SCORE_BG: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
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
        setStatus(p.status);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const seo = useMemo(
    () => computeSeoScore({ title, content, metaTitle, metaDescription, targetKeyword }),
    [title, content, metaTitle, metaDescription, targetKeyword],
  );
  const words = useMemo(() => wordCount(content), [content]);

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

  const color = seoColor(seo);

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
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"Píš v Markdowne…\n\n# Hlavný nadpis (H1)\n\n## Podnadpis (H2)\n\nText odseku…"}
              className="min-h-[520px] w-full rounded-xl border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <Card>
              <CardContent className="min-h-[520px] py-5">
                <Markdown>{content || "_Zatiaľ prázdne — prepni na Editor a začni písať._"}</Markdown>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted">{words} slov</p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO skóre</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
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
                <p className="text-xs text-muted">Aktualizuje sa počas písania</p>
              </div>
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
              <LabeledField label={`Meta title (${metaTitle.length}/60)`}>
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              </LabeledField>
              <LabeledField label={`Meta description (${metaDescription.length}/160)`}>
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </LabeledField>
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
    </div>
  );
}
