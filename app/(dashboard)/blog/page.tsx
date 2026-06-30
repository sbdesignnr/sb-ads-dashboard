"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Newspaper, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeeklyPlan } from "@/components/blog/WeeklyPlan";
import { useCachedResource } from "@/lib/client-cache";
import { formatRelativeTime } from "@/lib/utils/formatters";
import { seoColor } from "@/lib/blog/seo";
import { cn } from "@/lib/utils";
import type { BlogPostDTO } from "@/lib/blog/types";

export default function BlogPage() {
  const router = useRouter();
  const { data, loading, refresh } = useCachedResource<{ posts: BlogPostDTO[] }>(
    "blog-posts",
    () => fetch("/api/blog").then((r) => r.json()),
    { ttl: 30_000 },
  );
  const [creating, setCreating] = useState(false);
  const posts = data?.posts ?? [];

  const createPost = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json();
      if (j.post?.id) router.push(`/blog/${j.post.id}`);
    } finally {
      setCreating(false);
    }
  };

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Naozaj vymazať tento článok?")) return;
    await fetch(`/api/blog/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Blog</h1>
          <p className="text-sm text-muted">SEO-optimalizované články pre sbdesign.sk</p>
        </div>
        <Button onClick={createPost} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Nový článok
        </Button>
      </div>

      <WeeklyPlan />

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Načítavam články…
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Newspaper className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted">Zatiaľ žiadne články. Začni svojím prvým.</p>
              <Button onClick={createPost} disabled={creating} variant="secondary" size="sm">
                <Plus className="h-4 w-4" />
                Nový článok
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Názov</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kategória</TableHead>
                  <TableHead>Cieľové KW</TableHead>
                  <TableHead className="text-center">SEO</TableHead>
                  <TableHead className="text-right">Upravené</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => router.push(`/blog/${p.id}`)}
                    className="group cursor-pointer hover:bg-surface-2/60"
                  >
                    <TableCell className="max-w-[280px]">
                      <span className="block truncate font-medium text-foreground group-hover:text-primary">
                        {p.title || "(bez názvu)"}
                      </span>
                      <span className="block truncate text-xs text-muted">/{p.slug}</span>
                    </TableCell>
                    <TableCell>
                      {p.status === "published" ? (
                        <Badge variant="success">Publikované</Badge>
                      ) : (
                        <Badge variant="warning">Koncept</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted">{p.category || "—"}</TableCell>
                    <TableCell className="text-sm text-muted">
                      {p.targetKeyword ? (
                        <span className="inline-flex items-center gap-1">
                          <Search className="h-3 w-3" />
                          {p.targetKeyword}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                          seoColor(p.seoScore) === "success" && "bg-success/15 text-success",
                          seoColor(p.seoScore) === "warning" && "bg-warning/15 text-warning",
                          seoColor(p.seoScore) === "danger" && "bg-danger/15 text-danger",
                        )}
                      >
                        {p.seoScore}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted">
                      {formatRelativeTime(p.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={(e) => del(p.id, e)}
                        className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 cursor-pointer"
                        aria-label="Vymazať"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
