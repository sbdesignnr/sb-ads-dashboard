"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { RefreshCw, Loader2 } from "lucide-react";

export function SyncButton({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const sync = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/videos/sync", { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        const added = j.added ?? 0;
        toast.success(
          added > 0
            ? `Pridaných ${added} nových videí (${j.channels} kanálov)`
            : `Žiadne nové videá (${j.channels} kanálov)`,
        );
        onDone?.();
        router.refresh();
      } else {
        toast.error(j.error || "Obnovenie zlyhalo");
      }
    } catch {
      toast.error("Obnovenie zlyhalo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={sync}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Obnoviť
    </button>
  );
}
