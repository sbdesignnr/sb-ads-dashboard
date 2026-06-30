import Link from "next/link";
import { Youtube, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function VideosPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Videá</h1>
          <p className="text-sm text-muted">Kurátorovaný YouTube feed z vybraných kanálov.</p>
        </div>
        <Link
          href="/videos/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
        >
          <Settings className="h-4 w-4" />
          Nastavenia
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <Youtube className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-muted">
            Feed videí pribudne čoskoro. Najprv pridaj YouTube kanály a rozdeľ ich do kategórií v
            nastaveniach.
          </p>
          <Link
            href="/videos/settings"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Settings className="h-4 w-4" />
            Spravovať kanály a kategórie
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
