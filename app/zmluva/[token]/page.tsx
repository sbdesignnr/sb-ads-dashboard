"use client";

import { use, useEffect, useState } from "react";
import { Loader2, Check, ShieldCheck } from "lucide-react";

interface ContractData {
  project: { name: string; company: string };
  content: string;
  status: string;
  signedAt: string | null;
  signedByName: string | null;
}

export default function ContractSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/contract/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Zmluva sa nenašla alebo je link neplatný."))
      .finally(() => setLoading(false));
  }, [token]);

  const sign = async () => {
    if (name.trim().length < 3) return setError("Zadajte celé meno.");
    setSigning(true);
    setError("");
    try {
      const r = await fetch(`/api/public/contract/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (r.ok) {
        const fresh = await fetch(`/api/public/contract/${token}`).then((x) =>
          x.json(),
        );
        setData(fresh);
      } else {
        const j = await r.json().catch(() => ({}));
        setError(
          j.error === "already_signed"
            ? "Zmluva už bola podpísaná."
            : "Podpis sa nepodaril.",
        );
      }
    } catch {
      setError("Podpis sa nepodaril.");
    } finally {
      setSigning(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold text-primary">SB Design</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error && !data ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
            {error}
          </p>
        ) : data ? (
          <div className="space-y-5">
            <div
              className="prose-contract rounded-xl border border-border bg-surface p-6 text-sm leading-relaxed text-foreground sm:p-8"
              dangerouslySetInnerHTML={{ __html: data.content }}
            />

            {data.signedAt ? (
              <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-5">
                <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
                <div>
                  <p className="font-medium text-foreground">
                    Zmluva bola podpísaná ✓
                  </p>
                  <p className="text-sm text-muted">
                    Podpísal: {data.signedByName} ·{" "}
                    {new Intl.DateTimeFormat("sk-SK", {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date(data.signedAt))}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="mb-3 text-sm text-muted">
                  Podpisom potvrdzujem, že som sa oboznámil s obsahom zmluvy a
                  súhlasím s ňou.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Vaše celé meno"
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button
                    onClick={sign}
                    disabled={signing}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {signing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Podpísať zmluvu
                  </button>
                </div>
                {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
