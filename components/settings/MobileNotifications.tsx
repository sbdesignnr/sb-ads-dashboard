"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Smartphone, Send, Link2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface Settings {
  telegramLinked: boolean;
  enabled: boolean;
  alertConversions: boolean;
  alertActions: boolean;
  alertBlog: boolean;
  alertSeo: boolean;
  blogReminderDay: number; // ISO weekday 1=Po … 7=Ne
  blogReminderHour: number; // 0-23, Europe/Bratislava
  minConversionValue: number | null;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

const WEEKDAYS = [
  { value: 1, label: "Pondelok" },
  { value: 2, label: "Utorok" },
  { value: 3, label: "Streda" },
  { value: 4, label: "Štvrtok" },
  { value: 5, label: "Piatok" },
  { value: 6, label: "Sobota" },
  { value: 7, label: "Nedeľa" },
];

export function MobileNotifications() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/settings");
      const j = await res.json();
      setSettings(j.settings);
      setConfigured(j.telegramConfigured);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (body: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...body } : s));
    await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const link = async () => {
    setBusy("link");
    try {
      const res = await fetch("/api/notifications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link" }),
      });
      const j = await res.json();
      if (res.ok) {
        toast.success(`Prepojené s ${j.name}`);
        await load();
      } else {
        toast.error(j.error || "Prepojenie zlyhalo");
      }
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const res = await fetch("/api/notifications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const j = await res.json();
      res.ok ? toast.success("Testovacia správa odoslaná") : toast.error(j.error || "Odoslanie zlyhalo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Smartphone className="h-5 w-5 text-muted" />
        <CardTitle>Mobilné upozornenia (Google Ads)</CardTitle>
        <span className="ml-auto">
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : settings?.telegramLinked ? (
            <Badge variant="success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Prepojené
            </Badge>
          ) : (
            <Badge variant="default">Neprepojené</Badge>
          )}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : !configured ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Chýba <code>TELEGRAM_BOT_TOKEN</code> v premenných prostredia. Vytvor bota cez @BotFather a doplň token.
            </span>
          </div>
        ) : !settings?.telegramLinked ? (
          <>
            <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-sm text-muted">
              <p className="mb-1 font-medium text-foreground">Prepoj svoj Telegram (2 kroky):</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Na Telegrame nájdi svojho bota a napíš mu <code>/start</code>.</li>
                <li>Klikni nižšie „Prepojiť" — načítam tvoj chat automaticky.</li>
              </ol>
            </div>
            <Button onClick={link} disabled={busy === "link"}>
              {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Prepojiť Telegram
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Upozornenia zapnuté</p>
                <p className="text-xs text-muted">Hlavný vypínač pre všetky mobilné upozornenia.</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Nové konverzie</p>
                <p className="text-xs text-muted">Ping pri každej novej konverzii (hodnota + počet).</p>
              </div>
              <Switch checked={settings.alertConversions} onCheckedChange={(v) => patch({ alertConversions: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Nutné akcie (AI vyhodnotí)</p>
                <p className="text-xs text-muted">
                  Zamietnuté reklamy, platba/účet, rozpočet brzdí výkon, zlyhané meranie. AI posiela len naozaj
                  potrebné — nikdy zmeny kľúčových slov ani počas učenia.
                </p>
              </div>
              <Switch checked={settings.alertActions} onCheckedChange={(v) => patch({ alertActions: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Pripomienka na článok (týždenne)</p>
                <p className="text-xs text-muted">
                  Raz týždenne ti príde výzva napísať konkrétny článok — s témou, odôvodnením (sezónnosť, trend,
                  medzera oproti konkurencii), kľúčovým slovom, SEO potenciálom a osnovou. Už napísané témy preskakuje.
                </p>
              </div>
              <Switch checked={settings.alertBlog} onCheckedChange={(v) => patch({ alertBlog: v })} />
            </div>
            {settings.alertBlog && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
                <label className="space-y-1">
                  <span className="block text-xs text-muted">Deň</span>
                  <select
                    value={settings.blogReminderDay}
                    onChange={(e) => patch({ blogReminderDay: Number(e.target.value) })}
                    className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-muted">Hodina</span>
                  <select
                    value={settings.blogReminderHour}
                    onChange={(e) => patch({ blogReminderHour: Number(e.target.value) })}
                    className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted">
                  Príde raz týždenne v tento čas (Bratislava). Tiché hodiny ju nepotlačia.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">SEO prehľad (týždenne)</p>
                <p className="text-xs text-muted">
                  V pondelok ráno prehľad: skóre, tri najdôležitejšie úlohy na tento týždeň a overené
                  výsledky tých, ktoré si už spravil.
                </p>
              </div>
              <Switch checked={settings.alertSeo} onCheckedChange={(v) => patch({ alertSeo: v })} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={test} disabled={busy === "test"}>
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Test notifikácia
              </Button>
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Kontrola beží automaticky každých 30 min.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
