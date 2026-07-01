import { Target, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const segments = await prisma.leadSegment.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { leads: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Leady</h1>
        <p className="text-sm text-muted">
          AI vyhľadávanie firiem so zastaralými webmi na Slovensku, organizované podľa segmentov.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-5 w-5" />
          </div>
          <p>
            Dátový model je pripravený ({segments.length} segmentov). Vyhľadávanie firiem, analýza
            webov a UI pribudnú v ďalších fázach.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Segmenty</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1 truncate font-medium text-foreground">{s.name}</span>
                  <span className="text-xs text-muted">{s._count.leads} leadov</span>
                </div>
                {s.keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted"
                      >
                        <Search className="h-3 w-3" />
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
