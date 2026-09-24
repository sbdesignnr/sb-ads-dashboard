"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ListChecks, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QUALIFY_AT, COST_EUR_PER_EMAIL, formatEur } from "@/lib/leads/qualification";

interface Health {
  leads: { qualified: number; borderline: number; good: number; unscored: number };
  drafts: {
    total: number;
    qualified: number;
    borderline: number;
    good: number;
    unscored: number;
    hidden: number;
  };
  unsuitableDrafts: number;
  legacyQualified: number;
  editedUnsuitable: number;
  qualifiedVerified: number;
  qualifiedNoDraft: number;
}

/**
 * Vysvetľuje rozdiel medzi "vhodnými leadmi" a frontou konceptov. Koncepty vznikli
 * v čase, keď bol lead vyhodnotený inak (starý generátor, staré skóre) — panel ich
 * porovná s AKTUÁLNYM skóre a dovolí jedným klikom odstrániť koncepty pre nevhodné
 * leady a prepísať staré koncepty novým generátorom.
 */
export function QueueHealthPanel({
  segmentId,
  onChanged,
}: {
  /** id segmentu alebo "all" */
  segmentId: string;
  onChanged: () => void;
}) {
  const [h, setH] = useState<Health | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await fetch(
        `/api/leads/emails/queue-health?segment=${encodeURIComponent(segmentId)}`,
      ).then((r) => r.json());
      if (j.drafts) setH(j);
    } catch {
      /* ticho */
    }
  }, [segmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const cleanup = async () => {
    if (!h) return;
    const hide = h.drafts.good;
    if (
      !confirm(
        `Odstrániť ${h.unsuitableDrafts} konceptov pre leady, ktoré už nie sú vhodné na oslovenie?\n\n` +
          `• koncepty sa zmažú (schválené, odoslané a ručne upravené ostanú),\n` +
          (hide
            ? `• leady s jednoznačne dobrým webom (${hide}) sa skryjú do záložky „Skryté" (dajú sa vrátiť),\n`
            : "") +
          `• konceptom pre vhodné leady sa nič nestane.`,
      )
    )
      return;
    setCleaning(true);
    try {
      const j = await fetch("/api/leads/emails/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      }).then((r) => r.json());
      toast.success(
        `Odstránených ${j.deleted ?? 0} konceptov${j.hidden ? `, skrytých ${j.hidden} leadov` : ""}${j.keptEdited ? ` (ponechaných ${j.keptEdited} ručne upravených)` : ""}`,
        { duration: 7000 },
      );
    } catch {
      toast.error("Čistenie zlyhalo");
    } finally {
      setCleaning(false);
      await load();
      onChanged();
    }
  };

  const rewrite = async () => {
    if (!h) return;
    if (
      !confirm(
        `Prepísať ${h.legacyQualified} konceptov novým generátorom? Spotrebuje to približne ${formatEur(h.legacyQualified * COST_EUR_PER_EMAIL)} kreditu Anthropic (asi 2 centy na mail).`,
      )
    )
      return;
    setRewriting(true);
    const tid = toast.loading("Prepisujem koncepty novým generátorom…");
    let done = 0;
    let removed = 0;
    let costEur = 0;
    try {
      for (let round = 0; round < 60; round++) {
        const r = await fetch("/api/leads/emails/regenerate-legacy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        done += j.regenerated ?? 0;
        removed += j.removed ?? 0;
        costEur += j.usage?.estimatedEur ?? 0;
        toast.loading(
          `Prepisujem… ${done} hotových${removed ? `, ${removed} vyradených` : ""}${j.remaining ? `, ešte ${j.remaining}` : ""}`,
          { id: tid },
        );
        if (!j.remaining || !(j.regenerated || j.removed)) break;
      }
      toast.success(
        `Prepísaných ${done} konceptov${removed ? `, ${removed} nesplnilo kontrolu kvality a bolo vyradených` : ""} · spotreba ≈ ${formatEur(costEur)}`,
        { id: tid, duration: 8000 },
      );
    } catch {
      toast.error("Prepisovanie zlyhalo — už prepísané koncepty ostali, skús znova", {
        id: tid,
      });
    } finally {
      setRewriting(false);
      await load();
      onChanged();
    }
  };

  if (!h) return null;

  const clean =
    h.unsuitableDrafts === 0 && h.legacyQualified === 0 && h.qualifiedNoDraft === 0;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ListChecks className="h-4 w-4 text-primary" />
          Ktoré koncepty sú správne? (fronta vs. vhodné leady)
        </p>

        <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="mb-1 font-medium text-foreground">Leady v segmente (neoslovené)</p>
            <p>
              <span className="font-semibold text-success">{h.leads.qualified}</span> vhodných
              na oslovenie (skóre ≥ {QUALIFY_AT}) ·{" "}
              <span className="font-semibold text-warning">{h.leads.borderline}</span> hraničných
              · <span className="font-semibold text-foreground">{h.leads.good}</span> s webom v
              poriadku · <span className="font-semibold text-foreground">{h.leads.unscored}</span>{" "}
              bez skóre
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="mb-1 font-medium text-foreground">
              Koncepty čakajúce na schválenie: {h.drafts.total}
            </p>
            <p>
              <span className="font-semibold text-success">{h.drafts.qualified}</span> pre
              vhodné leady ({h.qualifiedVerified} s overeným menom) ·{" "}
              <span className="font-semibold text-danger">{h.unsuitableDrafts}</span> pre leady,
              ktoré už nie sú vhodné
              {h.unsuitableDrafts > 0
                ? ` (${h.drafts.good} web v poriadku, ${h.drafts.unscored} bez skóre, ${h.drafts.borderline} hraničných${h.drafts.hidden ? `, ${h.drafts.hidden} už skrytých` : ""})`
                : ""}
            </p>
          </div>
        </div>

        {clean ? (
          <p className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="h-4 w-4" />
            Fronta je čistá: všetky koncepty sú pre vhodné leady a vytvorené novým generátorom.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Koncepty vznikli skôr než sa leady preanalyzovali novým skórovaním, preto v rade
              ostali aj pre leady, ktoré už nie sú vhodné. Odporúčaný postup:{" "}
              <span className="text-foreground">
                1) odstrániť nevhodné → 2) prepísať staré koncepty → 3) „Načítať emaily na
                schválenie" pre zvyšných vhodných
                {h.qualifiedNoDraft > 0 ? ` (${h.qualifiedNoDraft} vhodných leadov s emailom ešte nemá koncept)` : ""}.
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {h.unsuitableDrafts > 0 && (
                <Button size="sm" variant="secondary" onClick={cleanup} disabled={cleaning || rewriting}>
                  {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  1) Odstrániť koncepty pre nevhodné leady ({h.unsuitableDrafts})
                </Button>
              )}
              {h.legacyQualified > 0 && (
                <Button size="sm" variant="secondary" onClick={rewrite} disabled={cleaning || rewriting}>
                  {rewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  2) Prepísať {h.legacyQualified} starých konceptov novým generátorom
                </Button>
              )}
            </div>
            {h.editedUnsuitable > 0 && (
              <p className="text-[11px] text-muted">
                {h.editedUnsuitable} konceptov pre nevhodné leady si ručne upravil — tie sa
                automaticky nemažú.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
