"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Landmark, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OwnerStats {
  total: number;
  verified: number;
  pending: number;
  unverified: number;
}

/**
 * Konateľ v oslovení: meno sa v mailoch používa LEN ak ho potvrdil obchodný
 * register (alebo vlastný web firmy / ručné potvrdenie). Panel ukazuje, koľko
 * leadov má overené meno, dovolí dorovnať overenie a opraviť oslovenie v už
 * vygenerovaných konceptoch, ktoré vznikli pred zavedením overovania.
 */
export function OwnerCheckPanel({
  segmentId,
  onChanged,
}: {
  /** id segmentu alebo "all" */
  segmentId: string;
  /** zavolá sa po overení/oprave (obnovenie frontov) */
  onChanged: () => void;
}) {
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [needFix, setNeedFix] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    try {
      const seg = encodeURIComponent(segmentId);
      const [s, f] = await Promise.all([
        fetch(`/api/leads/verify-owners?segment=${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails/fix-greetings?segment=${seg}`).then((r) => r.json()),
      ]);
      if (typeof s.total === "number") setStats(s);
      setNeedFix(f.needFix ?? 0);
    } catch {
      /* ticho */
    }
  }, [segmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const verifyAll = async () => {
    setVerifying(true);
    const tid = toast.loading("Overujem konateľov v registri…");
    let done = 0;
    let verified = 0;
    try {
      for (let round = 0; round < 200; round++) {
        const r = await fetch("/api/leads/verify-owners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        done += j.processed ?? 0;
        verified += j.verified ?? 0;
        toast.loading(
          `Overujem… ${done} skontrolovaných, ${verified} overených${j.remaining ? `, ešte ${j.remaining}` : ""}`,
          { id: tid },
        );
        if (!j.remaining || !j.processed) break;
      }
      toast.success(`Hotovo: ${verified} z ${done} leadov má overeného konateľa`, {
        id: tid,
        duration: 6000,
      });
    } catch {
      toast.error("Overovanie zlyhalo — skús znova, hotové leady sa nestratili", { id: tid });
    } finally {
      setVerifying(false);
      await load();
      onChanged();
    }
  };

  const fixGreetings = async () => {
    setFixing(true);
    try {
      const j = await fetch("/api/leads/emails/fix-greetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      }).then((r) => r.json());
      toast.success(`Opravené oslovenie v ${j.fixed ?? 0} konceptoch`);
    } catch {
      toast.error("Oprava zlyhala");
    } finally {
      setFixing(false);
      await load();
      onChanged();
    }
  };

  if (!stats || (stats.total === 0 && needFix === 0)) return null;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Landmark className="h-4 w-4 text-primary" />
              Oslovenie menom konateľa
            </p>
            <p className="text-xs text-muted">
              Meno sa v maile použije len ak ho potvrdil obchodný register (alebo
              web firmy). Kto nie je overený, dostane neutrálne „Dobrý deň," —
              radšej bez mena než so zlým.
            </p>
            <p className="text-xs text-muted">
              <span className="font-semibold text-success">{stats.verified}</span>{" "}
              z <span className="font-semibold text-foreground">{stats.total}</span>{" "}
              kvalifikovaných leadov s emailom má overené meno ·{" "}
              <span className="font-semibold text-foreground">{stats.unverified}</span>{" "}
              pôjde s neutrálnym oslovením
              {stats.pending > 0 ? ` (${stats.pending} ešte nebolo skúšaných)` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.pending > 0 && (
              <Button size="sm" variant="secondary" onClick={verifyAll} disabled={verifying}>
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Overiť konateľov ({stats.pending})
              </Button>
            )}
            {needFix > 0 && (
              <Button size="sm" variant="secondary" onClick={fixGreetings} disabled={fixing}>
                {fixing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                Opraviť oslovenie v konceptoch ({needFix})
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
