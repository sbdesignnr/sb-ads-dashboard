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
import { type LeadEmailDTO, type SegmentDTO, type CampaignDTO, EMAIL_TYPE_LABEL } from "@/lib/leads/types";

interface Stats {
  sentToday: number;
  pendingApproval: number;
  totalSent: number;
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// Open-tracking badge: red 0×, yellow 1×, green 2×+.
function OpenBadge({ count }: { count: number }) {
  return <Badge variant={count >= 2 ? "success" : count === 1 ? "warning" : "danger"}>👁 {count}×</Badge>;
}

export default function CampaignsPage() {
  const [segments, setSegments] = useState<SegmentDTO[]>([]);
  const [stats, setStats] = useState<Stats>({ sentToday: 0, pendingApproval: 0, totalSent: 0 });

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
  const [lastGen, setLastGen] = useState<{ generated: number; skipped: number } | null>(null);
  const [findingEmails, setFindingEmails] = useState(false);

  const [queue, setQueue] = useState<LeadEmailDTO[]>([]);
  const [followups, setFollowups] = useState<LeadEmailDTO[]>([]);
  const [sent, setSent] = useState<LeadEmailDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LeadEmailDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  // Email queues are scoped to the active campaign's segment.
  const loadQueues = useCallback(async () => {
    setLoading(true);
    try {
      const seg = `&segment=${encodeURIComponent(segmentId)}`;
      const [a, b, c] = await Promise.all([
        fetch(`/api/leads/emails?queue=initial${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails?queue=followup${seg}`).then((r) => r.json()),
        fetch(`/api/leads/emails?queue=sent${seg}`).then((r) => r.json()),
      ]);
      setQueue(a.emails ?? []);
      setFollowups(b.emails ?? []);
      setSent(c.emails ?? []);
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

  // Reload the visible queues whenever the active segment changes.
  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

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
    segmentId === "all" ? "Všetky segmenty" : segments.find((s) => s.id === segmentId)?.name ?? "—";

  const saveCampaign = async (overrides: Partial<{ isActive: boolean }> = {}) => {
    setSavingCampaign(true);
    try {
      const payload = {
        name: segmentId === "all" ? "Všetky segmenty" : segments.find((s) => s.id === segmentId)?.name ?? "Kampaň",
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

  const generateBatch = async () => {
    setGenerating(true);
    toast.loading("Generujem emaily…", { id: "gen" });
    try {
      const j = await fetch("/api/leads/emails/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId, limit: dailyLimit }),
      }).then((r) => r.json());
      if (j.error) {
        toast.error(j.error, { id: "gen" });
      } else {
        setLastGen({ generated: j.generated ?? 0, skipped: j.skipped ?? 0 });
        toast.success(
          `Vygenerovaných ${j.generated}${j.skipped ? ` · ${j.skipped} preskočených` : ""}${j.failed ? ` · ${j.failed} zlyhaných` : ""}`,
          { id: "gen" },
        );
      }
      loadQueues();
      loadCampaigns();
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
        toast.success(`Nájdených ${j.found} emailov z ${j.processed} leadov`, { id: "find", duration: 6000 });
        setLastGen(null); // hide the button
        loadQueues();
        loadCampaigns();
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
      await fetch(`/api/leads/emails/${email.id}/${action}`, { method: "PATCH" });
      setQueue((q) => q.filter((e) => e.id !== email.id));
      setFollowups((q) => q.filter((e) => e.id !== email.id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(email.id);
        return n;
      });
      loadCampaigns();
    } finally {
      setBusyId(null);
    }
  };

  const sendNow = async (email: LeadEmailDTO) => {
    setBusyId(email.id);
    try {
      const j = await fetch(`/api/leads/emails/${email.id}/send`, { method: "POST" }).then((r) => r.json());
      if (j.success) {
        toast.success("Email odoslaný ✓");
        setQueue((q) => q.filter((e) => e.id !== email.id));
        setFollowups((q) => q.filter((e) => e.id !== email.id));
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
      const j = await fetch(`/api/leads/emails/${email.id}/generate`, { method: "POST" }).then((r) => r.json());
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
    await Promise.all(ids.map((id) => fetch(`/api/leads/emails/${id}/reject`, { method: "PATCH" })));
    setQueue((q) => q.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    toast.success(`Zamietnutých ${ids.length}`);
    loadCampaigns();
  };

  const allSelected = queue.length > 0 && selected.size === queue.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(queue.map((e) => e.id)));
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
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Späť
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Emailové kampane</h1>
          <p className="text-sm text-muted">Generuj, schvaľuj a plánuj cold emaily pre leady.</p>
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
            <Select value={campaignId ?? "__new__"} onValueChange={selectCampaign}>
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
              <Badge variant={isActive ? "success" : "default"}>{isActive ? "Aktívna" : "Neaktívna"}</Badge>
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
              <span className="text-xs text-muted">Emailov denne</span>
              <input
                type="number"
                min={1}
                max={50}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted">Čas odoslania</span>
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={isActive} onCheckedChange={toggleActive} />
              Kampaň aktívna
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => saveCampaign()} disabled={savingCampaign}>
                {savingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Uložiť
              </Button>
              <Button size="sm" onClick={generateBatch} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Načítať emaily na schválenie
              </Button>
              {lastGen && lastGen.generated === 0 && lastGen.skipped > 0 && (
                <Button size="sm" variant="secondary" onClick={findMissingEmails} disabled={findingEmails}>
                  {findingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {findingEmails ? "Hľadám emaily…" : "Hľadať chýbajúce emaily"}
                </Button>
              )}
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
              Žiadne emaily na schválenie. Klikni „Načítať emaily na schválenie".
            </p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-1 pb-2 text-xs text-muted">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary" />
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
            <p className="py-6 text-center text-sm text-muted">Žiadne followupy nie sú momentálne na rade.</p>
          ) : (
            <div className="space-y-1">
              {followups.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  onOpen={() => setEditing(e)}
                  onApprove={() => act(e, "approve")}
                  onReject={() => act(e, "reject")}
                  onGenerate={!e.body?.trim() ? () => generateBody(e) : undefined}
                  onSend={e.body?.trim() ? () => sendNow(e) : undefined}
                  busy={busyId === e.id}
                  showType
                />
              ))}
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
            <p className="py-6 text-center text-sm text-muted">Zatiaľ žiadne odoslané emaily pre tento segment.</p>
          ) : (
            <div className="space-y-1">
              {sent.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{e.companyName}</span>
                      {e.segmentName && <span className="shrink-0 text-xs text-muted">· {e.segmentName}</span>}
                    </div>
                    <p className="truncate text-xs text-muted">{e.subject || "—"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {e.sentAt ? new Date(e.sentAt).toLocaleDateString("sk-SK") : ""}
                  </span>
                  <OpenBadge count={e.openCount} />
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
            setFollowups((q) => q.map((e) => (e.id === updated.id ? updated : e)));
          }}
          onApproved={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setEditing(null);
            loadCampaigns();
          }}
          onRejected={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setEditing(null);
            loadCampaigns();
          }}
          onSent={(id) => {
            setQueue((q) => q.filter((e) => e.id !== id));
            setFollowups((q) => q.filter((e) => e.id !== id));
            setEditing(null);
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
        <input type="checkbox" checked={checked} onChange={onCheck} className="h-4 w-4 shrink-0 accent-primary" />
      )}
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{email.companyName}</span>
          {email.segmentName && <span className="shrink-0 text-xs text-muted">· {email.segmentName}</span>}
          {showType && (
            <Badge variant={email.emailType === "followup2" ? "warning" : "info"}>
              {EMAIL_TYPE_LABEL[email.emailType]}
            </Badge>
          )}
          {!email.companyEmail && <Badge variant="danger">Chýba email</Badge>}
        </div>
        <p className="truncate text-xs text-foreground/80">{email.subject || "—"}</p>
        <p className="truncate text-xs text-muted">{email.body ? email.body.replace(/\s+/g, " ").slice(0, 90) : "(bez tela)"}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {onGenerate && (
          <Button size="sm" variant="ghost" onClick={onGenerate} disabled={busy} aria-label="Vygenerovať">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onApprove} disabled={busy} aria-label="Schváliť">
          <Check className="h-4 w-4 text-success" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject} disabled={busy} aria-label="Zamietnuť">
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
  onRejected,
  onSent,
}: {
  email: LeadEmailDTO;
  onClose: () => void;
  onSaved: (e: LeadEmailDTO) => void;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
  onSent: (id: string) => void;
}) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const save = async (): Promise<LeadEmailDTO | null> => {
    const j = await fetch(`/api/leads/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    }).then((r) => r.json());
    return j.email ?? null;
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
      const j = await fetch(`/api/leads/emails/${email.id}/send`, { method: "POST" }).then((r) => r.json());
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">{email.companyName}</h2>
            <p className="truncate text-xs text-muted">
              {email.segmentName ?? "—"}
              {email.companyCity ? ` · ${email.companyCity}` : ""}
              {email.websiteUrl ? ` · ${email.websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}` : ""}
              {" · "}
              {email.companyEmail ?? "chýba email"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted">Predmet</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
        <label className="mb-1 block text-xs text-muted">Telo emailu</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />

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
            <Button size="sm" variant="secondary" onClick={saveAndApprove} disabled={saving || sending}>
              <Check className="h-4 w-4" />
              Uložiť & Schváliť
            </Button>
            <Button
              size="sm"
              onClick={sendNow}
              disabled={saving || sending || !email.companyEmail}
              title={email.companyEmail ? "Odoslať teraz" : "Chýba email"}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Odoslať teraz
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
