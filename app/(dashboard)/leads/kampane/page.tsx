"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Loader2,
  Check,
  X,
  Pencil,
  Send,
  Sparkles,
  Mail,
  Clock,
  Inbox,
  CheckCheck,
  Search,
  Link2 as LinkIcon,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TemplateBar } from "@/components/leads/TemplateBar";
import {
  type LeadEmailDTO,
  type SegmentDTO,
  type CampaignDTO,
  EMAIL_TYPE_LABEL,
} from "@/lib/leads/types";

interface Stats {
  sentToday: number;
  pendingApproval: number;
  totalSent: number;
}

interface SegmentSummary {
  leadsTotal: number;
  withEmail: number;
  contacted: number;
  notContacted: number;
  drafts: number;
  approved: number;
  noEmail: number;
}

/** ISO → hodnota pre <input type="datetime-local"> v lokálnom čase. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Hodnota z datetime-local (lokálny čas) → ISO (UTC) pre server, alebo null. */
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v); // prehliadač parsuje datetime-local ako lokálny čas
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Ľudský zápis naplánovaného času, napr. „21. 7. o 9:00". */
function fmtSchedule(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. o ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "primary" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "primary"
        ? "text-primary"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", color)}>
        {value}
      </p>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

// Open-tracking badge: red 0×, yellow 1×, green 2×+.
function OpenBadge({ count }: { count: number }) {
  return (
    <Badge
      variant={count >= 2 ? "success" : count === 1 ? "warning" : "danger"}
    >
      👁 {count}×
    </Badge>
  );
}

// Clicks are a stronger signal than opens (Gmail caches the open pixel), so only
// surface the badge when there's at least one.
function ClickBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return <Badge variant="success">👆 {count}×</Badge>;
}

// Mirrors lib/leads/email-sender.ts so the preview shows exactly what gets sent:
// escape first (no injection), then render the Markdown subset. Boundaries stop a
// stray asterisk ("5*3") from italicising half the message.
const PV_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const PV_BOLD = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g;
const PV_ITALIC = /(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g;

function previewHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(
      PV_LINK,
      '<a href="$2" style="color:#4A90D9;text-decoration:underline;">$1</a>',
    )
    .replace(PV_BOLD, "<strong>$1</strong>")
    .replace(PV_ITALIC, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

/**
 * The sender only ever sends an approved email if some ACTIVE campaign covers its
 * lead's segment (a campaign with no segment set covers all of them). If none does,
 * the email sits in "Schválené" forever and nothing tells you why — so we say why.
 */
function blockedReason(
  email: LeadEmailDTO,
  campaigns: CampaignDTO[],
): string | null {
  const active = campaigns.filter((c) => c.isActive);
  if (!active.length) return "Žiadna kampaň nie je zapnutá";
  const covers = active.some(
    (c) => !c.segmentId || c.segmentId === email.segmentId,
  );
  return covers ? null : "Žiadna zapnutá kampaň nepokrýva segment tohto leadu";
}

export default function CampaignsPage() {
  const [segments, setSegments] = useState<SegmentDTO[]>([]);
  const [stats, setStats] = useState<Stats>({
    sentToday: 0,
    pendingApproval: 0,
    totalSent: 0,
  });

  // All campaigns (switchable) + the currently selected one's editable settings.
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const initialized = useRef(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState("all");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [sendTime, setSendTime] = useState("08:30");
  const [isActive, setIsActive] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [findingEmails, setFindingEmails] = useState(false);

  const [queue, setQueue] = useState<LeadEmailDTO[]>([]);
  const [followups, setFollowups] = useState<LeadEmailDTO[]>([]);
  const [approved, setApproved] = useState<LeadEmailDTO[]>([]);
  const [sent, setSent] = useState<LeadEmailDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LeadEmailDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SegmentSummary | null>(null);

  const applyCampaign = useCallback((c: CampaignDTO) => {
    setCampaignId(c.id);
    setSegmentId(c.segmentId ?? "all");
    setDailyLimit(c.dailyLimit);
    setSendTime(c.sendTime);
    setIsActive(c.isActive);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const j = await fetch("/api/leads/campaigns").then((r) => r.json());
    setStats(j.stats ?? { sentToday: 0, pendingApproval: 0, totalSent: 0 });
    setCampaigns(j.campaigns ?? []);
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const j = await fetch(
        `/api/leads/emails/summary?segment=${encodeURIComponent(segmentId)}`,
      ).then((r) => r.json());
      if (!j.error) setSummary(j);
    } catch {
      /* ticho */
    }
  }, [segmentId]);

  // Email queues are scoped to the active campaign's segment.
  const loadQueues = useCallback(async () => {
    setLoading(true);
    try {
      const seg = `&segment=${encodeURIComponent(segmentId)}`;
      const [a, b, c, d] = await Promise.all([
        fetch(`/api/leads/emails?queue=initial${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails?queue=followup${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails?queue=approved${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails?queue=sent${seg}`).then((r) => r.json()),
      ]);
      setQueue(a.emails ?? []);
      setFollowups(b.emails ?? []);
      setApproved(c.emails ?? []);
      setSent(d.emails ?? []);
    } finally {
      setLoading(false);
    }
  }, [segmentId]);

  // Load segments + campaigns once.
  useEffect(() => {
    fetch("/api/leads/segments")
      .then((r) => r.json())
      .then((j) => setSegments(j.segments ?? []))
      .catch(() => {});
    loadCampaigns();
  }, [loadCampaigns]);

  // Select the first campaign once, on initial load (not when the user picks
  // "Nová kampaň", which sets campaignId back to null on purpose).
  useEffect(() => {
    if (initialized.current || campaigns.length === 0) return;
    initialized.current = true;
    applyCampaign(campaigns[0]);
  }, [campaigns, applyCampaign]);

  // Reload the visible queues + summary whenever the active segment changes.
  useEffect(() => {
    loadQueues();
    loadSummary();
  }, [loadQueues, loadSummary]);

  const selectCampaign = (id: string) => {
    if (id === "__new__") {
      setCampaignId(null);
      setSegmentId("all");
      setDailyLimit(20);
      setSendTime("08:30");
      setIsActive(false);
      return;
    }
    const c = campaigns.find((x) => x.id === id);
    if (c) applyCampaign(c);
  };

  const activeSegmentName =
    segmentId === "all"
      ? "Všetky segmenty"
      : (segments.find((s) => s.id === segmentId)?.name ?? "—");

  const saveCampaign = async (
    overrides: Partial<{ isActive: boolean }> = {},
  ) => {
    setSavingCampaign(true);
    try {
      const payload = {
        name:
          segmentId === "all"
            ? "Všetky segmenty"
            : (segments.find((s) => s.id === segmentId)?.name ?? "Kampaň"),
        segmentId,
        dailyLimit,
        sendTime,
        isActive: overrides.isActive ?? isActive,
      };
      let id = campaignId;
      if (!id) {
        const j = await fetch("/api/leads/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());
        id = j.campaign?.id ?? null;
        setCampaignId(id);
      }
      if (id) {
        await fetch(`/api/leads/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      toast.success("Kampaň uložená");
      loadCampaigns();
    } finally {
      setSavingCampaign(false);
    }
  };

  const toggleActive = async (v: boolean) => {
    setIsActive(v);
    await saveCampaign({ isActive: v });
  };

  // Načíta koncepty pre VŠETKY zvyšné neoslovené leady segmentu — server generuje
  // po dávkach (kvôli časovému limitu), tu voláme dokola, kým `remaining` != 0.
  const generateBatch = async () => {
    setGenerating(true);
    let totalGen = 0;
    let lastMissing = 0;
    toast.loading("Generujem emaily…", { id: "gen" });
    try {
      for (let round = 0; round < 30; round++) {
        const j = await fetch("/api/leads/emails/generate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId }),
        }).then((r) => r.json());
        if (j.error) {
          toast.error(j.error, { id: "gen" });
          break;
        }
        totalGen += j.generated ?? 0;
        lastMissing = j.missingEmail ?? 0;
        toast.loading(
          `Generujem… ${totalGen} hotových${j.remaining ? `, ešte ${j.remaining}` : ""}`,
          { id: "gen" },
        );
        // Koniec, keď nič nezostáva alebo sa už nedá pohnúť (zvyšok bez emailu / chyby).
        if (!j.remaining || !j.generated) break;
      }
      toast.success(
        `Načítaných ${totalGen} emailov na schválenie${lastMissing ? ` · ${lastMissing} leadov bez emailu` : ""}`,
        { id: "gen", duration: 5000 },
      );
      loadQueues();
      loadCampaigns();
      loadSummary();
    } catch {
      toast.error("Generovanie zlyhalo", { id: "gen" });
    } finally {
      setGenerating(false);
    }
  };

  // Bulk-find contact emails for leads in this segment that have none, then let
  // the user re-generate. (The request is a single call — no live X/Y progress.)
  const findMissingEmails = async () => {
    setFindingEmails(true);
    toast.loading("Hľadám chýbajúce emaily…", { id: "find" });
    try {
      const j = await fetch("/api/leads/find-emails-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      }).then((r) => r.json());
      if (j.error) {
        toast.error(j.error, { id: "find" });
      } else {
        toast.success(`Nájdených ${j.found} emailov z ${j.processed} leadov`, {
          id: "find",
          duration: 5000,
        });
        loadCampaigns();
        // generateBatch reloads the queues + refreshes the missing-email count,
        // and turns the newly-found emails into drafts.
        await generateBatch();
      }
    } catch {
      toast.error("Hľadanie zlyhalo", { id: "find" });
    } finally {
      setFindingEmails(false);
    }
  };

  const act = async (email: LeadEmailDTO, action: "approve" | "reject") => {
    setBusyId(email.id);
    try {
      await fetch(`/api/leads/emails/${email.id}/${action}`, {
        method: "PATCH",
      });
      setQueue((q) => q.filter((e) => e.id !== email.id));
      setFollowups((q) => q.filter((e) => e.id !== email.id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(email.id);
        return n;
      });
      // An approved e-mail moves to the "waiting to send" shelf, not into the void.
      if (action === "approve") loadQueues();
      loadCampaigns();
    } finally {
      setBusyId(null);
    }
  };

  /** Approved → back to drafts, so a mistake caught after approving is fixable. */
  const unapprove = async (email: LeadEmailDTO) => {
    setBusyId(email.id);
    try {
      await fetch(`/api/leads/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      toast.success("Vrátené do konceptov — môžeš ho upraviť");
      await loadQueues();
      loadCampaigns();
    } finally {
      setBusyId(null);
    }
  };

  const sendNow = async (email: LeadEmailDTO) => {
    setBusyId(email.id);
    try {
      const j = await fetch(`/api/leads/emails/${email.id}/send`, {
        method: "POST",
      }).then((r) => r.json());
      if (j.success) {
        toast.success("Email odoslaný ✓");
        setQueue((q) => q.filter((e) => e.id !== email.id));
        setFollowups((q) => q.filter((e) => e.id !== email.id));
        setApproved((q) => q.filter((e) => e.id !== email.id));
        loadQueues();
        loadCampaigns();
      } else {
        toast.error(j.error || "Odoslanie zlyhalo");
      }
    } finally {
      setBusyId(null);
    }
  };

  const generateBody = async (email: LeadEmailDTO) => {
    setBusyId(email.id);
    try {
      const j = await fetch(`/api/leads/emails/${email.id}/generate`, {
        method: "POST",
      }).then((r) => r.json());
      if (j.email) {
        setFollowups((q) => q.map((e) => (e.id === email.id ? j.email : e)));
        toast.success("Followup vygenerovaný");
      } else {
        toast.error(j.error || "Generovanie zlyhalo");
      }
    } finally {
      setBusyId(null);
    }
  };

  const bulkApprove = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    await fetch("/api/leads/emails/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailIds: ids }),
    });
    setQueue((q) => q.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    toast.success(`Schválených ${ids.length}`);
    loadCampaigns();
  };

  const bulkReject = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/leads/emails/${id}/reject`, { method: "PATCH" }),
      ),
    );
    setQueue((q) => q.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    toast.success(`Zamietnutých ${ids.length}`);
    loadCampaigns();
  };

  const allSelected = queue.length > 0 && selected.size === queue.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(queue.map((e) => e.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Späť
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Emailové kampane
          </h1>
          <p className="text-sm text-muted">
            Generuj, schvaľuj a plánuj cold emaily pre leady.
          </p>
        </div>
      </div>

      {/* SEKCIA A — settings */}
      <Card>
        <CardHeader>
          <CardTitle>Nastavenia kampane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Campaign switcher — pick which campaign (segment) you're managing */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Kampaň:</span>
            <Select
              value={campaignId ?? "__new__"}
              onValueChange={selectCampaign}
            >
              <SelectTrigger className="h-9 w-auto min-w-[220px]">
                <SelectValue placeholder="Nová kampaň" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive ? " · aktívna" : ""}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">＋ Nová kampaň</SelectItem>
              </SelectContent>
            </Select>
            {campaignId && (
              <Badge variant={isActive ? "success" : "default"}>
                {isActive ? "Aktívna" : "Neaktívna"}
              </Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs text-muted">Segment</span>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Všetky nové</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span
                className="text-xs text-muted"
                title="Maximálny počet schválených mailov, ktoré appka odošle za jeden deň"
              >
                Emailov denne
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={dailyLimit}
                onChange={(e) =>
                  setDailyLimit(
                    Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="block text-[11px] leading-tight text-muted">
                Max. koľko schválených mailov sa odošle za deň. Zvyšné počkajú
                na ďalší deň.
              </span>
            </label>
            <label className="space-y-1">
              <span
                className="text-xs text-muted"
                title="Denný čas, o ktorom sa odošlú schválené maily bez vlastného naplánovania"
              >
                Čas odoslania
              </span>
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="block text-[11px] leading-tight text-muted">
                O tomto čase sa denne odošlú schválené maily (ak nemajú vlastný
                čas).
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={isActive} onCheckedChange={toggleActive} />
              Kampaň aktívna
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => saveCampaign()}
                disabled={savingCampaign}
              >
                {savingCampaign ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Uložiť
              </Button>
              <Button size="sm" onClick={generateBatch} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Načítať emaily na schválenie
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={findMissingEmails}
                disabled={findingEmails}
              >
                {findingEmails ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {findingEmails
                  ? "Hľadám emaily…"
                  : "Hľadať emaily pre leady bez kontaktu"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Odoslaných dnes" value={stats.sentToday} />
            <StatBox label="Čaká na schválenie" value={stats.pendingApproval} />
            <StatBox label="Celkom odoslaných" value={stats.totalSent} />
          </div>
        </CardContent>
      </Card>

      {/* The queues below show ONLY the active campaign's segment. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Zobrazujem emaily pre segment:</span>
        <Badge variant="info">{activeSegmentName}</Badge>
      </div>

      {/* Prehľad segmentu — koľko leadov zo skenov, koľko oslovených, čo čaká. */}
      {summary && (
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Leady zo skenov" value={summary.leadsTotal} />
              <SummaryTile
                label="Oslovených"
                value={summary.contacted}
                tone="success"
              />
              <SummaryTile label="Neoslovených" value={summary.notContacted} />
              <SummaryTile
                label="Čaká na schválenie"
                value={summary.drafts}
                tone="primary"
              />
              <SummaryTile
                label="Schválené"
                value={summary.approved}
                tone="primary"
              />
              <SummaryTile
                label="Bez emailu"
                value={summary.noEmail}
                tone={summary.noEmail ? "warning" : undefined}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              {summary.notContacted > 0 ? (
                <>
                  Z {summary.leadsTotal} leadov je {summary.contacted}{" "}
                  oslovených. „Načítať emaily na schválenie" pripraví koncepty
                  pre zvyšných neoslovených
                  {summary.noEmail
                    ? ` (okrem ${summary.noEmail} bez emailu)`
                    : ""}
                  .
                </>
              ) : (
                <>Všetky leady v segmente sú už oslovené alebo pripravené. 🎉</>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* SEKCIA B — initial queue */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted" />
            Fronta emailov ({queue.length})
          </CardTitle>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={bulkApprove}>
                <CheckCheck className="h-4 w-4" />
                Schváliť ({selected.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={bulkReject}>
                <X className="h-4 w-4" />
                Zamietnuť
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Načítavam…
            </div>
          ) : queue.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Žiadne emaily na schválenie. Klikni „Načítať emaily na
              schválenie".
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-1 pb-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-primary"
                />
                Vybrať všetky
              </div>
              {queue.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  checked={selected.has(e.id)}
                  onCheck={() => toggleOne(e.id)}
                  onOpen={() => setEditing(e)}
                  onApprove={() => act(e, "approve")}
                  onReject={() => act(e, "reject")}
                  onSend={() => sendNow(e)}
                  busy={busyId === e.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Followup queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted" />
            Followupy na schválenie ({followups.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Žiadne followupy nie sú momentálne na rade.
            </p>
          ) : (
            <div className="space-y-1">
              {followups.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  onOpen={() => setEditing(e)}
                  onApprove={() => act(e, "approve")}
                  onReject={() => act(e, "reject")}
                  onGenerate={
                    !e.body?.trim() ? () => generateBody(e) : undefined
                  }
                  onSend={e.body?.trim() ? () => sendNow(e) : undefined}
                  busy={busyId === e.id}
                  showType
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approved, waiting for the sender — still fully editable. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            Schválené — čakajú na odoslanie ({approved.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Žiadne schválené emaily čakajúce na odoslanie.
            </p>
          ) : (
            <div className="space-y-1">
              {(() => {
                const blocked = approved.filter((e) =>
                  blockedReason(e, campaigns),
                );
                if (!blocked.length) return null;
                return (
                  <div className="mb-2 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {blocked.length} z {approved.length} sa automaticky
                        NEODOŠLE
                      </p>
                      <p className="text-muted">
                        Automat posiela len emaily, ktoré spadajú pod{" "}
                        <strong>zapnutú</strong> kampaň. Zapni kampaň vyššie a
                        nastav jej segment na ten, z ktorého sú tieto leady
                        (alebo na „Všetky segmenty“). Tlačidlom „Odoslať“ ich
                        vieš poslať aj hneď ručne.
                      </p>
                    </div>
                  </div>
                );
              })()}
              <p className="pb-1 text-xs text-muted">
                Klikni na email a stále ho vieš upraviť, vrátiť do konceptov
                alebo odoslať hneď.
              </p>
              {approved.map((e) => {
                const blocked = blockedReason(e, campaigns);
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {e.companyName}
                        </span>
                        {e.segmentName && (
                          <span className="shrink-0 text-xs text-muted">
                            · {e.segmentName}
                          </span>
                        )}
                        {blocked && (
                          <span
                            title={blocked}
                            className="flex shrink-0 items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Neodošle sa
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {blocked ?? (e.subject || "—")}
                      </p>
                      {e.scheduledAt && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary">
                          <Clock className="h-3 w-3" />
                          Naplánované {fmtSchedule(e.scheduledAt)}
                        </span>
                      )}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unapprove(e)}
                      disabled={busyId === e.id}
                    >
                      Späť do konceptov
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => sendNow(e)}
                      disabled={busyId === e.id || !e.companyEmail}
                      title={e.companyEmail ? "Odoslať teraz" : "Chýba email"}
                    >
                      {busyId === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Odoslať
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sent emails with open tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted" />
            Odoslané emaily ({sent.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Zatiaľ žiadne odoslané emaily pre tento segment.
            </p>
          ) : (
            <div className="space-y-1">
              {sent.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {e.companyName}
                      </span>
                      {e.segmentName && (
                        <span className="shrink-0 text-xs text-muted">
                          · {e.segmentName}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted">
                      {e.subject || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {e.sentAt
                      ? new Date(e.sentAt).toLocaleDateString("sk-SK")
                      : ""}
                  </span>
                  <OpenBadge count={e.openCount} />
                  <ClickBadge count={e.clickCount} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EmailEditor
          email={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setQueue((q) => q.map((e) => (e.id === updated.id ? updated : e)));
            setFollowups((q) =>
              q.map((e) => (e.id === updated.id ? updated : e)),
            );
            setApproved((q) =>
              q.map((e) => (e.id === updated.id ? updated : e)),
            );
            setEditing(updated); // keep the open modal in sync
          }}
          onApproved={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setEditing(null);
            loadQueues(); // it now shows up under "Schválené"
            loadCampaigns();
          }}
          onUnapproved={() => {
            setEditing(null);
            loadQueues();
            loadCampaigns();
          }}
          onRejected={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setApproved((q) => q.filter((e) => e.id !== id));
            setEditing(null);
            loadCampaigns();
          }}
          onSent={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setApproved((q) => q.filter((e) => e.id !== id));
            setEditing(null);
            loadQueues();
            loadCampaigns();
          }}
        />
      )}
    </div>
  );
}

function EmailRow({
  email,
  checked,
  onCheck,
  onOpen,
  onApprove,
  onReject,
  onGenerate,
  onSend,
  busy,
  showType,
}: {
  email: LeadEmailDTO;
  checked?: boolean;
  onCheck?: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onGenerate?: () => void;
  onSend?: () => void;
  busy?: boolean;
  showType?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      {onCheck && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          className="h-4 w-4 shrink-0 accent-primary"
        />
      )}
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {email.companyName}
          </span>
          {email.segmentName && (
            <span className="shrink-0 text-xs text-muted">
              · {email.segmentName}
            </span>
          )}
          {showType && (
            <Badge
              variant={email.emailType === "followup2" ? "warning" : "info"}
            >
              {EMAIL_TYPE_LABEL[email.emailType]}
            </Badge>
          )}
          {!email.companyEmail && <Badge variant="danger">Chýba email</Badge>}
        </div>
        <p className="truncate text-xs text-foreground/80">
          {email.subject || "—"}
        </p>
        <p className="truncate text-xs text-muted">
          {email.body
            ? email.body.replace(/\s+/g, " ").slice(0, 90)
            : "(bez tela)"}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {onGenerate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onGenerate}
            disabled={busy}
            aria-label="Vygenerovať"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onOpen} aria-label="Upraviť">
          <Pencil className="h-4 w-4" />
        </Button>
        {onSend && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSend}
            disabled={busy || !email.companyEmail}
            aria-label="Odoslať teraz"
            title={email.companyEmail ? "Odoslať teraz" : "Chýba email"}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-primary" />
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onApprove}
          disabled={busy}
          aria-label="Schváliť"
        >
          <Check className="h-4 w-4 text-success" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReject}
          disabled={busy}
          aria-label="Zamietnuť"
        >
          <X className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </div>
  );
}

function EmailEditor({
  email,
  onClose,
  onSaved,
  onApproved,
  onUnapproved,
  onRejected,
  onSent,
}: {
  email: LeadEmailDTO;
  onClose: () => void;
  onSaved: (e: LeadEmailDTO) => void;
  onApproved: (id: string) => void;
  onUnapproved: (id: string) => void;
  onRejected: (id: string) => void;
  onSent: (id: string) => void;
}) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [scheduled, setScheduled] = useState(toLocalInput(email.scheduledAt));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const downOnBackdrop = useRef(false);
  const isApproved = email.status === "approved";

  /** Wrap the selected text in Markdown the sender renders (**bold**, *italic*, [text](url)). */
  const wrap = (before: string, after: string, placeholder: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + sel + after + body.slice(end);
    setBody(next);
    // Re-select the wrapped text so it can be typed over straight away.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(
        start + before.length,
        start + before.length + sel.length,
      );
    });
  };

  const addLink = () => {
    const url = prompt("Adresa odkazu (https://…)", "https://www.sbdesign.sk");
    if (!url || !/^https?:\/\//i.test(url)) return;
    wrap("[", `](${url})`, "text odkazu");
  };

  const save = async (): Promise<LeadEmailDTO | null> => {
    const j = await fetch(`/api/leads/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body,
        scheduledAt: localInputToIso(scheduled),
      }),
    }).then((r) => r.json());
    return j.email ?? null;
  };

  const unapprove = async () => {
    setSaving(true);
    try {
      const updated = await save();
      if (updated) onSaved(updated);
      await fetch(`/api/leads/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      toast.success("Vrátené do konceptov");
      onUnapproved(email.id);
    } finally {
      setSaving(false);
    }
  };

  const saveAndApprove = async () => {
    setSaving(true);
    try {
      const updated = await save();
      if (updated) onSaved(updated);
      await fetch(`/api/leads/emails/${email.id}/approve`, { method: "PATCH" });
      toast.success("Uložené a schválené");
      onApproved(email.id);
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    await fetch(`/api/leads/emails/${email.id}/reject`, { method: "PATCH" });
    onRejected(email.id);
  };

  const sendNow = async () => {
    setSending(true);
    try {
      // Persist any edits first so the sent copy matches what's on screen.
      const updated = await save();
      if (updated) onSaved(updated);
      const j = await fetch(`/api/leads/emails/${email.id}/send`, {
        method: "POST",
      }).then((r) => r.json());
      if (j.success) {
        toast.success("Email odoslaný ✓");
        onSent(email.id);
      } else {
        toast.error(j.error || "Odoslanie zlyhalo");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Zavrieť len na SKUTOČNOM kliknutí na pozadie — teda keď stlačenie začalo
      // aj skončilo na pozadí. Keď ťaháš myšou (napr. označuješ text) a omylom
      // vyjdeš mimo okna, stlačenie začalo vnútri → nezavrie sa a postup ostane.
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">
              {email.companyName}
            </h2>
            <p className="truncate text-xs text-muted">
              {email.segmentName ?? "—"}
              {email.companyCity ? ` · ${email.companyCity}` : ""}
              {email.websiteUrl
                ? ` · ${email.websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}`
                : ""}
              {" · "}
              {email.companyEmail ?? "chýba email"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3">
          <TemplateBar
            subject={subject}
            body={body}
            vars={{
              firma: email.companyName,
              mesto: email.companyCity,
              web: email.websiteUrl,
              konatel: email.ownerName,
              // {{kraj}} sa dopočíta z mesta vo fillTemplate
            }}
            onInsert={(s, b) => {
              // Predmet nastavíme len ak je prázdny; telo vložíme na pozíciu kurzora
              // (alebo nahradíme prázdne telo), nech sa neprepíše rozrobená práca.
              if (s && !subject.trim()) setSubject(s);
              const ta = bodyRef.current;
              if (!body.trim() || !ta) {
                setBody(b);
              } else {
                const start = ta.selectionStart ?? body.length;
                setBody(
                  body.slice(0, start) +
                    b +
                    body.slice(ta.selectionEnd ?? start),
                );
              }
            }}
          />
        </div>

        <label className="mb-1 block text-xs text-muted">Predmet</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-muted">Telo emailu</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => wrap("**", "**", "tučný text")}
              title="Tučné (**text**)"
              className="rounded border border-border px-2 py-1 text-xs font-bold text-foreground hover:bg-surface-2"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => wrap("*", "*", "šikmý text")}
              title="Šikmé (*text*)"
              className="rounded border border-border px-2 py-1 text-xs italic text-foreground hover:bg-surface-2"
            >
              I
            </button>
            <button
              type="button"
              onClick={addLink}
              title="Vložiť odkaz"
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2"
            >
              <LinkIcon className="h-3 w-3" />
              Odkaz
            </button>
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              className={cn(
                "rounded border px-2 py-1 text-xs",
                preview
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {preview ? "Upraviť" : "Náhľad"}
            </button>
          </div>
        </div>

        {preview ? (
          <div
            className="min-h-[280px] w-full rounded-lg border border-border bg-white px-4 py-3 text-sm leading-relaxed text-black"
            dangerouslySetInnerHTML={{ __html: previewHtml(body) }}
          />
        ) : (
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        <p className="mt-1 text-xs text-muted">
          Formátovanie: <code>**tučné**</code> · <code>*šikmé*</code> ·{" "}
          <code>[text](https://odkaz.sk)</code> — v Náhľade uvidíš, ako to príde
          klientovi.
        </p>

        {/* Naplánovanie odoslania */}
        <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-muted" />
            <label className="text-sm text-foreground">
              Odoslať dňa a o čase:
            </label>
            <input
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            {scheduled && (
              <button
                type="button"
                onClick={() => setScheduled("")}
                className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                zrušiť čas
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {scheduled
              ? `Odošle sa najskôr ${fmtSchedule(localInputToIso(scheduled))} (v rámci denného limitu kampane).`
              : "Bez času sa odošle podľa denného času kampane po schválení. Nastav čas, ak chceš konkrétny deň/hodinu."}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={reject}>
            <X className="h-4 w-4 text-danger" />
            Zamietnuť
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setSaving(true);
                const u = await save();
                setSaving(false);
                if (u) {
                  onSaved(u);
                  toast.success("Uložené");
                }
              }}
              disabled={saving || sending}
            >
              <Check className="h-4 w-4" />
              Uložiť zmeny
            </Button>
            {isApproved ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={unapprove}
                disabled={saving || sending}
              >
                <X className="h-4 w-4" />
                Vrátiť do konceptov
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={saveAndApprove}
                disabled={saving || sending}
              >
                <Check className="h-4 w-4" />
                Uložiť & Schváliť
              </Button>
            )}
            <Button
              size="sm"
              onClick={sendNow}
              disabled={saving || sending || !email.companyEmail}
              title={email.companyEmail ? "Odoslať teraz" : "Chýba email"}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Odoslať teraz
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
