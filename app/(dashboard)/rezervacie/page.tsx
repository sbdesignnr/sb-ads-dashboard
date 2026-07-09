"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Calendar, Clock, Mail, Phone, Building2, ExternalLink, X, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BookingRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  clientCompany: string | null;
  message: string | null;
  status: string;
  googleMeetLink: string | null;
}

interface Settings {
  availableDays: number[];
  startTime: string;
  endTime: string;
  duration: number;
  bufferTime: number;
  minNotice: number;
  ownerEmail: string;
  meetingTitle: string;
}

const DAYS = [
  { n: 1, label: "Po" },
  { n: 2, label: "Ut" },
  { n: 3, label: "St" },
  { n: 4, label: "Št" },
  { n: 5, label: "Pi" },
  { n: 6, label: "So" },
  { n: 7, label: "Ne" },
];

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("sk-SK", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export default function BookingAdminPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      fetch("/api/booking/list").then((r) => r.json()),
      fetch("/api/booking/settings").then((r) => r.json()),
    ]);
    setBookings(l.bookings ?? []);
    setSettings(s.settings ?? null);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const cancel = async (id: string) => {
    if (!confirm("Zrušiť túto rezerváciu?")) return;
    await fetch(`/api/booking/${id}/cancel`, { method: "PATCH" });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    toast.success("Rezervácia zrušená");
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const j = await fetch("/api/booking/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }).then((r) => r.json());
      if (j.settings) {
        setSettings(j.settings);
        toast.success("Nastavenia uložené");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (n: number) => {
    if (!settings) return;
    const has = settings.availableDays.includes(n);
    setSettings({
      ...settings,
      availableDays: has ? settings.availableDays.filter((d) => d !== n) : [...settings.availableDays, n].sort(),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }

  const upcoming = bookings.filter((b) => b.status === "confirmed");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Rezervácie</h1>
          <p className="text-sm text-muted">Prehľad termínov a nastavenia verejnej booking stránky.</p>
        </div>
        <a
          href="/booking"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-primary/40"
        >
          <ExternalLink className="h-4 w-4" />
          Otvoriť verejnú stránku
        </a>
      </div>

      {/* Settings */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Nastavenia dostupnosti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-xs text-muted">Dostupné dni</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => toggleDay(d.n)}
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                      (settings.availableDays.includes(d.n)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:text-foreground")
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted">Od</span>
                <input
                  type="time"
                  value={settings.startTime}
                  onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Do</span>
                <input
                  type="time"
                  value={settings.endTime}
                  onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Trvanie (min)</span>
                <input
                  type="number"
                  value={settings.duration}
                  onChange={(e) => setSettings({ ...settings, duration: Number(e.target.value) || 30 })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Buffer (min)</span>
                <input
                  type="number"
                  value={settings.bufferTime}
                  onChange={(e) => setSettings({ ...settings, bufferTime: Number(e.target.value) || 0 })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Min. predstih (h)</span>
                <input
                  type="number"
                  value={settings.minNotice}
                  onChange={(e) => setSettings({ ...settings, minNotice: Number(e.target.value) || 0 })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">Notifikačný email</span>
                <input
                  value={settings.ownerEmail}
                  onChange={(e) => setSettings({ ...settings, ownerEmail: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
            <Button size="sm" onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Uložiť nastavenia
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upcoming bookings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted" />
            Budúce rezervácie ({upcoming.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Zatiaľ žiadne rezervácie.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className={
                    "flex flex-wrap items-start gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm " +
                    (b.status === "cancelled" ? "opacity-50" : "")
                  }
                >
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="h-3.5 w-3.5 text-muted" />
                    {fmtDate(b.date)} · {b.startTime}-{b.endTime}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">
                      {b.clientName}
                      {b.clientCompany ? ` · ${b.clientCompany}` : ""}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {b.clientEmail}
                      </span>
                      {b.clientPhone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {b.clientPhone}
                        </span>
                      )}
                      {b.clientCompany && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {b.clientCompany}
                        </span>
                      )}
                    </div>
                    {b.message && <p className="mt-1 text-xs text-muted">„{b.message}"</p>}
                  </div>
                  {b.status === "cancelled" ? (
                    <Badge variant="danger">Zrušená</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => cancel(b.id)} aria-label="Zrušiť">
                      <X className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
