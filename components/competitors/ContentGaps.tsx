"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Lightbulb, PenLine, Loader2, Search, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCachedResource } from "@/lib/client-cache";
import type { ContentGap } from "@/lib/competitors/content-gaps";

export function ContentGaps() {
  const router = useRouter();
  const { data: gaps, loading } = useCachedResource<ContentGap[]>(
    "competitor-content-gaps",
    () =>
      fetch("/api/competitors/content-gaps")
        .then((r) => r.json())
        .then((j) => j.gaps ?? []),
    { ttl: 10 * 60 * 1000 },
  );
  const [creating, setCreating] = useState<string | null>(null);

  const write = async (gap: ContentGap) => {
    setCreating(gap.id);
    try {
      const res = await fetch("/api/blog/from-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gap.title,
          targetKeyword: gap.targetKeyword,
          reason: gap.reason,
          outline: gap.outline,
        }),
      });
      const j = await res.json();
      if (j.post?.id) {
        router.push(`/blog/${j.post.id}`);
        return;
      }
      toast.error("Nepodarilo sa vytvoriť článok");
    } catch {
      toast.error("Nepodarilo sa vytvoriť článok");
    }
    setCreating(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-warning" />
        <h2 className="text-lg font-semibold text-foreground">Obsahové medzery (Content Gaps)</h2>
        {gaps && gaps.length > 0 && <Badge variant="warning">{gaps.length}</Badge>}
      </div>

      {loading && !gaps ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            AI hľadá témy, ktoré pokrýva konkurencia a ty nie…
          </CardContent>
        </Card>
      ) : !gaps || gaps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted">
            Zatiaľ žiadne obsahové medzery. Spusti sken konkurencie pre návrhy.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gaps.map((gap) => (
            <Card key={gap.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{gap.title}</CardTitle>
                {gap.targetKeyword && (
                  <span className="inline-flex w-fit items-center gap-1 text-xs text-muted">
                    <Search className="h-3 w-3" />
                    {gap.targetKeyword}
                  </span>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {gap.reason && <p className="text-sm text-muted">{gap.reason}</p>}
                {gap.outline.length > 0 && (
                  <ul className="space-y-1">
                    {gap.outline.slice(0, 5).map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => write(gap)}
                  disabled={creating === gap.id}
                  className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
                >
                  {creating === gap.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PenLine className="h-4 w-4" />
                  )}
                  Napísať tento článok
                  <ArrowRight className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
