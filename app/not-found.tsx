import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-7xl font-bold text-gradient">404</p>
      <h1 className="text-xl font-semibold text-foreground">Stránka nebola nájdená</h1>
      <p className="max-w-sm text-sm text-muted">
        Stránka, ktorú hľadáte, neexistuje alebo bola presunutá.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        <ArrowLeft className="h-4 w-4" />
        Späť na prehľad
      </Link>
    </div>
  );
}
