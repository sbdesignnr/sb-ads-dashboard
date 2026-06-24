import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function CampaignNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
        <SearchX className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Kampaň nenájdená</h1>
      <p className="max-w-sm text-sm text-muted">
        Táto kampaň neexistuje alebo bola odstránená.
      </p>
      <Link
        href="/google-ads"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Späť na kampane
      </Link>
    </div>
  );
}
