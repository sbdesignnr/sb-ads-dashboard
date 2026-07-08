"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Globe,
  Gauge,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Layers,
  Sparkles,
  Mail,
  Copy,
  Check,
  Loader2,
  Save,
  AlertTriangle,
  TrendingDown,
  Lightbulb,
  Clock,
  Compass,
  Ban,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/ai/ScoreGauge";
import { copyToClipboard } from "@/lib/export";
import { cn } from "@/lib/utils";
import { type LeadDTO, type LeadStatus, LEAD_STATUS_LABEL } from "@/lib/leads/types";

const STATUSES: LeadStatus[] = ["new", "contacted", "responded", "converted", "rejected"];

function Row({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<LeadDTO | null>(null);
  const [segmentName, setSegmentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [brief, setBrief] = useState<{ summary: string; painPoint: string; opportunity: string } | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [email, setEmail] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.lead) {
          setLead(j.lead);
          setSegmentName(j.segmentName ?? null);
          setNotes(j.lead.notes ?? "");
          setIssues(j.lead.websiteIssues ?? []);
          if (j.lead.aiSummary || j.lead.aiPainPoint || j.lead.aiOpportunity) {
            setBrief({
              summary: j.lead.aiSummary ?? "",
              painPoint: j.lead.aiPainPoint ?? "",
              opportunity: j.lead.aiOpportunity ?? "",
            });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const setStatus = async (status: LeadStatus) => {
    if (!lead) return;
    setLead({ ...lead, status });
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      toast.success("Poznámka uložená");
    } finally {
      setSavingNotes(false);
    }
  };

  const runAi = async (type: "analysis" | "email") => {
    const setBusy = type === "email" ? setEmailing : setAnalyzing;
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const j = await res.json();
      if (res.ok && type === "email" && j.text) {
        setEmail(j.text);
      } else if (res.ok && type === "analysis" && j.lead) {
        setLead(j.lead);
        setIssues(j.lead.websiteIssues ?? []);
        setBrief({
          summary: j.lead.aiSummary ?? "",
          painPoint: j.lead.aiPainPoint ?? "",
          opportunity: j.lead.aiOpportunity ?? "",
        });
        toast.success("Analýza aktualizovaná");
      } else {
        toast.error(j.error || "Generovanie zlyhalo");
      }
    } catch {
      toast.error("Generovanie zlyhalo");
    } finally {
      setBusy(false);
    }
  };

  const copyEmail = async () => {
    if (await copyToClipboard(email)) {
      setCopied(true);
      toast.success("Email skopírovaný");
      setTimeout(() => setCopied(false), 1800);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Načítavam…
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        Lead nenájdený.{" "}
        <Link href="/leads" className="text-primary hover:underline">
          Späť na leady
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Späť
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground">{lead.companyName}</h1>
          <p className="text-sm text-muted">
            {segmentName ?? "Bez segmentu"}
            {lead.companyCity ? ` · ${lead.companyCity}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold tabular-nums",
            (lead.websiteScore ?? 0) >= 60
              ? "bg-danger/15 text-danger"
              : (lead.websiteScore ?? 0) >= 40
                ? "bg-warning/15 text-warning"
                : "bg-surface-2 text-muted",
          )}
          title="Skóre zastaralosti webu"
        >
          {lead.websiteScore ?? "—"}
        </span>
      </div>

      {lead.companyActive === false && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <Ban className="h-4 w-4 shrink-0" />
          Firma je podľa registra neaktívna (vymazaná/v likvidácii) — pravdepodobne nemá zmysel ju oslovovať.
        </div>
      )}

      {/* Status management */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Status:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors cursor-pointer",
              lead.status === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {LEAD_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Data */}
        <div className="space-y-5">
          {/* Web Quality Score gauge */}
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6">
              <ScoreGauge score={lead.websiteScore ?? 0} size={160} label="Web Quality" />
              <p className="text-center text-xs text-muted">
                Vyššie skóre = zastaralejší web (lepší lead). Prah kvalifikácie 65.
              </p>
              <div className="flex w-full justify-center gap-8 text-sm">
                <div className="text-center">
                  <div className="font-semibold tabular-nums text-foreground">
                    {lead.technicalScore ?? "—"}
                    <span className="text-muted">/40</span>
                  </div>
                  <div className="text-xs text-muted">Technické</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold tabular-nums text-foreground">
                    {lead.visualScore ?? "—"}
                    <span className="text-muted">/60</span>
                  </div>
                  <div className="text-xs text-muted">Vizuálne</div>
                </div>
              </div>
              {lead.disqualifyReason && (
                <div className="flex w-full items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{lead.disqualifyReason}</span>
                </div>
              )}
              {lead.websiteUrl && (
                <div className="flex w-full gap-2">
                  <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4" />
                      Otvoriť web
                    </Button>
                  </a>
                  <a
                    href={`https://www.responsinator.com/?url=${encodeURIComponent(lead.websiteUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      <Smartphone className="h-4 w-4" />
                      Na mobile
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Web & analýza</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {lead.websiteUrl && (
                <Row icon={Globe} label="Web">
                  <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {lead.websiteUrl}
                  </a>
                </Row>
              )}
              <Row icon={Layers} label="Technológia">
                {lead.websiteTechnology ?? "neznáma"}
                {lead.hasModernFramework ? " · moderný framework" : ""}
              </Row>
              <Row icon={Gauge} label="PageSpeed">
                mobile {lead.pageSpeedMobile ?? "—"}/100 · desktop {lead.pageSpeedDesktop ?? "—"}/100
              </Row>
              <Row icon={lead.hasSsl ? ShieldCheck : ShieldOff} label="SSL (HTTPS)">
                {lead.hasSsl === null ? "neznáme" : lead.hasSsl ? "áno" : "nie"}
              </Row>
              <Row icon={Smartphone} label="Responzívny">
                {lead.isMobileFriendly === null ? "neznáme" : lead.isMobileFriendly ? "áno" : "nie"}
              </Row>
              {lead.websiteAge != null && (
                <Row icon={Layers} label="Vek webu">~{lead.websiteAge} rokov (podľa copyrightu)</Row>
              )}
            </CardContent>
          </Card>

          {(lead.aiVisualReason || lead.visualIssues.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Vizuálne hodnotenie (AI)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lead.aiVisualReason && (
                  <p className="text-sm leading-relaxed text-foreground">{lead.aiVisualReason}</p>
                )}
                {lead.visualIssues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {lead.visualIssues.map((v, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Zistené nedostatky</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {issues.map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Príležitosť (AI)</CardTitle>
              <Button variant="secondary" size="sm" onClick={() => runAi("analysis")} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {brief ? "Prepočítať" : "Analyzovať"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief ? (
                <>
                  {brief.summary && <p className="text-sm leading-relaxed text-foreground">{brief.summary}</p>}
                  {brief.painPoint && (
                    <div className="rounded-lg border border-danger/25 bg-danger/5 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-danger">
                        <TrendingDown className="h-3.5 w-3.5" />
                        Kde firma stráca
                      </p>
                      <p className="text-sm leading-relaxed text-foreground">{brief.painPoint}</p>
                    </div>
                  )}
                  {brief.opportunity && (
                    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                        <Lightbulb className="h-3.5 w-3.5" />
                        Čo vieme ponúknuť
                      </p>
                      <p className="text-sm leading-relaxed text-foreground">{brief.opportunity}</p>
                    </div>
                  )}
                  {lead.aiOutreachAngle && (
                    <div className="flex items-start gap-2 text-sm">
                      <Compass className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                      <span>
                        <span className="text-muted">Ako osloviť: </span>
                        <span className="text-foreground">{lead.aiOutreachAngle}</span>
                      </span>
                    </div>
                  )}
                  {lead.bestContactTime && (
                    <div className="flex items-start gap-2 text-sm">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                      <span>
                        <span className="text-muted">Najlepší čas: </span>
                        <span className="text-foreground">{lead.bestContactTime}</span>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="py-2 text-sm text-muted">
                  Klikni na „Analyzovať" — AI z konkrétnych nedostatkov pripraví pain point a príležitosť, na ktorej
                  firme reálne pomôžeme (a zarobíme).
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contact + email + notes */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Kontakt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Row icon={Globe} label="Konateľ">
                {lead.ownerName ? `${lead.ownerName}${lead.ownerPosition ? ` (${lead.ownerPosition})` : ""}` : "neznámy"}
              </Row>
              <Row icon={Mail} label="Email">{lead.companyEmail ?? "—"}</Row>
              <Row icon={Globe} label="Telefón">{lead.companyPhone ?? "—"}</Row>
              <Row icon={Globe} label="Adresa">{lead.companyAddress ?? "—"}</Row>
              <Row icon={Globe} label="IČO">{lead.ico ?? "—"}</Row>
              <Row icon={Globe} label="Zdroj">{lead.source ?? "—"}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Personalizovaný email</CardTitle>
              <Button variant="secondary" size="sm" onClick={() => runAi("email")} disabled={emailing}>
                {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {email ? "Znova" : "Vygenerovať"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {email ? (
                <>
                  <textarea
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button variant="outline" size="sm" onClick={copyEmail}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Kopírovať
                  </Button>
                </>
              ) : (
                <p className="py-2 text-sm text-muted">
                  AI napíše krátky personalizovaný cold email pre túto firmu (meno konateľa, konkrétne
                  problémy webu, CTA).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Poznámky</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Interné poznámky k leadu…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button variant="secondary" size="sm" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Uložiť poznámku
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
