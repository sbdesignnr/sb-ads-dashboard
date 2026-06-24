"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  Unplug,
  RefreshCw,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoogleAdsConnectionStatus } from "@/lib/google-ads/types";
import { cn } from "@/lib/utils";

type Banner = { tone: "success" | "danger" | "warning"; text: string } | null;

const BANNERS: Record<string, Banner> = {
  connected: { tone: "success", text: "Google Ads účet bol úspešne pripojený." },
  error: { tone: "danger", text: "Pripojenie zlyhalo. Skús to znova." },
  no_refresh: {
    tone: "warning",
    text: "Google nevrátil refresh token. Odpoj aplikáciu v Google účte a skús to znova.",
  },
  not_configured: {
    tone: "warning",
    text: "Chýbajú API credentials v premenných prostredia (.env.local).",
  },
};

export function GoogleAdsConnection() {
  const [status, setStatus] = useState<GoogleAdsConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google-ads/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Show a one-off banner based on the OAuth redirect result.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (result && BANNERS[result]) {
      setBanner(BANNERS[result]);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchStatus]);

  const connect = () => {
    window.location.href = "/api/google-ads/auth";
  };

  const disconnect = async () => {
    setWorking(true);
    try {
      await fetch("/api/google-ads/status", { method: "DELETE" });
      await fetchStatus();
    } finally {
      setWorking(false);
    }
  };

  const connected = status?.connected;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <PlugZap className="h-5 w-5 text-muted" />
        <CardTitle>Google Ads pripojenie</CardTitle>
        <span className="ml-auto">
          {loading ? (
            <Skeleton className="h-6 w-24" />
          ) : connected ? (
            <Badge variant="success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Pripojené
            </Badge>
          ) : (
            <Badge variant="default">Nepripojené</Badge>
          )}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {banner && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              banner.tone === "success" && "border-success/30 bg-success/10 text-success",
              banner.tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
              banner.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
            )}
          >
            {banner.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {banner.text}
          </div>
        )}

        {loading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : connected ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow icon={Building2} label="Customer ID" value={formatCustomerId(status?.customerId)} />
              <InfoRow
                icon={Building2}
                label="Login (MCC) ID"
                value={formatCustomerId(status?.loginCustomerId)}
              />
            </div>
            <p className="text-xs text-muted">
              Prehľad a stránka Google Ads teraz čerpajú reálne dáta z API. Pri chybe alebo limite sa
              automaticky použijú demo dáta.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={fetchStatus} disabled={working}>
                <RefreshCw className={cn("h-4 w-4", working && "animate-spin")} />
                Obnoviť stav
              </Button>
              <Button variant="danger" size="sm" onClick={disconnect} disabled={working}>
                <Unplug className="h-4 w-4" />
                Odpojiť
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Pripoj svoj Google Ads účet cez OAuth2 a nahraď demo dáta reálnymi metrikami kampaní.
              {status && !status.configured && (
                <span className="text-warning"> Najprv doplň API credentials do .env.local.</span>
              )}
            </p>
            <Button variant="gradient" onClick={connect} disabled={status ? !status.configured : false}>
              <PlugZap className="h-4 w-4" />
              Pripojiť Google Ads účet
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatCustomerId(id?: string | null): string {
  if (!id) return "—";
  const digits = id.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return id;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-0.5 font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
