"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Bell, Link2, Palette, User, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GoogleAdsConnection } from "@/components/settings/GoogleAdsConnection";

const ACCENTS = [
  { name: "Electric Blue", color: "#3B82F6" },
  { name: "Purple", color: "#8B5CF6" },
  { name: "Emerald", color: "#10B981" },
  { name: "Amber", color: "#F59E0B" },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(session?.user?.name ?? "SB Design Admin");
  const [accent, setAccent] = useState("#3B82F6");
  const [notifications, setNotifications] = useState({
    weeklyReport: true,
    budgetAlerts: true,
    anomalyDetection: true,
    aiRecommendations: false,
  });
  const [connections, setConnections] = useState({ google: true, meta: true });
  const [compact, setCompact] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nastavenia</h1>
          <p className="text-sm text-muted">Spravuj svoj účet a predvoľby dashboardu.</p>
        </div>
        <Button onClick={save} variant={saved ? "secondary" : "default"}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Uložené" : "Uložiť zmeny"}
        </Button>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <User className="h-5 w-5 text-muted" />
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Meno</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={session?.user?.email ?? "admin@sbdesign.sk"} disabled />
          </div>
        </CardContent>
      </Card>

      {/* Google Ads — real API connection */}
      <GoogleAdsConnection />

      {/* Other connected platforms */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Link2 className="h-5 w-5 text-muted" />
          <CardTitle>Ostatné platformy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConnectionRow
            label="Meta Ads"
            accountId="act_998877665"
            connected={connections.meta}
            onToggle={(v) => setConnections((c) => ({ ...c, meta: v }))}
            dot="bg-secondary"
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Bell className="h-5 w-5 text-muted" />
          <CardTitle>Notifikácie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <ToggleRow
            label="Týždenný report"
            description="Súhrn výkonu každý pondelok ráno"
            checked={notifications.weeklyReport}
            onChange={(v) => setNotifications((n) => ({ ...n, weeklyReport: v }))}
          />
          <ToggleRow
            label="Upozornenia na rozpočet"
            description="Notifikácia pri vyčerpaní denného rozpočtu"
            checked={notifications.budgetAlerts}
            onChange={(v) => setNotifications((n) => ({ ...n, budgetAlerts: v }))}
          />
          <ToggleRow
            label="Detekcia anomálií"
            description="Upozorni ma na náhle zmeny vo výkone"
            checked={notifications.anomalyDetection}
            onChange={(v) => setNotifications((n) => ({ ...n, anomalyDetection: v }))}
          />
          <ToggleRow
            label="AI odporúčania emailom"
            description="Posielaj nové AI odporúčania na email"
            checked={notifications.aiRecommendations}
            onChange={(v) => setNotifications((n) => ({ ...n, aiRecommendations: v }))}
          />
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Palette className="h-5 w-5 text-muted" />
          <CardTitle>Vzhľad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Akcentová farba</p>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.color}
                  onClick={() => setAccent(a.color)}
                  title={a.name}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all cursor-pointer",
                    accent === a.color ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: `${a.color}22` }}
                >
                  <span className="h-5 w-5 rounded-md" style={{ backgroundColor: a.color }} />
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="Kompaktný režim"
            description="Zníž medzery a zhusti rozloženie"
            checked={compact}
            onChange={setCompact}
          />
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Téma</p>
              <p className="text-xs text-muted">Tmavá téma je optimalizovaná pre tento dashboard</p>
            </div>
            <Badge variant="info">Dark</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ConnectionRow({
  label,
  accountId,
  connected,
  onToggle,
  dot,
}: {
  label: string;
  accountId: string;
  connected: boolean;
  onToggle: (v: boolean) => void;
  dot: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-2/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={cn("h-2.5 w-2.5 rounded-sm", dot)} />
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted">ID účtu: {accountId}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {connected ? (
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Prepojené
          </Badge>
        ) : (
          <Badge variant="default">Odpojené</Badge>
        )}
        <Switch checked={connected} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}
