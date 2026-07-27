"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  Loader2,
  FileText,
  Receipt,
  ClipboardList,
  Copy,
  ExternalLink,
  Mail,
  Building2,
  User,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { money, shortDate, dateInput } from "@/lib/onboarding/format";
import {
  PROJECT_STATUSES,
  PROJECT_TYPE_LABEL,
  type ProjectSummaryDTO,
  type ChecklistItemDTO,
  type QuestionnaireDTO,
  type InvoiceDTO,
} from "@/lib/onboarding/types";

// ── Popisky odpovedí dotazníka ────────────────────────────────────────────────
const L = {
  websiteGoal: { leads: "Získavať dopyty/klientov", eshop: "Predávať (e-shop)", trust: "Budovať dôveru", info: "Informovať", other: "Iné" },
  hasPhotos: { yes: "Áno, mám", no_need_shoot: "Nie, treba fotenie", stock: "Použiť stock fotky" },
  hasTexts: { yes: "Áno, mám", no_client: "Nie, dodám neskôr", need_help: "Potrebujem pomoc" },
  cmsNeeded: { full: "Plný CMS", partial: "Čiastočný", none: "Nie je treba" },
  bookingNeeded: { none: "Netreba", form: "Formulár", full: "Plný systém", payment: "S platbou", reminders: "S pripomienkami" },
  maintenanceInterest: { none: "Nie", basic: "Základná", advanced: "Rozšírená", later: "Neskôr" },
  seoInterest: { none: "Nie", basic: "Základné", ongoing: "Priebežné", info: "Chcem info" },
  adsInterest: { none: "Nie", google: "Google", meta: "Meta", both: "Oboje", info: "Chcem info" },
} as const;

function lbl(map: Record<string, string>, v: string | null): string {
  return v ? (map[v] ?? v) : "—";
}

// ── Odpovede z dotazníka ──────────────────────────────────────────────────────
function Answer({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return null;
  return (
    <div className="py-1.5">
      <p className="text-xs text-muted">{label}</p>
      <div className="text-sm text-foreground">{Array.isArray(value) ? value.join(", ") : value}</div>
    </div>
  );
}

function QuestionnaireView({ q }: { q: QuestionnaireDTO }) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border-t border-border pt-3 first:border-0 first:pt-0">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      {children}
    </div>
  );
  const colorSwatch = (hex: string | null) =>
    hex ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-border" style={{ background: hex }} />
        {hex}
      </span>
    ) : null;

  return (
    <div className="space-y-3">
      <Section title="O biznise">
        <Answer label="Čím sa firma zaoberá" value={q.businessDescription} />
        <Answer label="Ideálny zákazník" value={q.idealCustomer} />
        <Answer label="Jedinečná hodnota" value={q.uniqueValue} />
        <Answer label="Cieľ webu" value={lbl(L.websiteGoal, q.websiteGoal)} />
      </Section>
      <Section title="Dizajn">
        <Answer label="Značka v 3 slovách" value={q.brandWords} />
        <Answer label="Hlavná farba" value={colorSwatch(q.primaryColor)} />
        <Answer label="Doplnková farba" value={colorSwatch(q.secondaryColor)} />
        <Answer label="Inšpirácie" value={q.inspirationUrls} />
        <Answer label="Čo sa nepáči" value={q.antiInspirationUrls} />
      </Section>
      <Section title="Obsah a funkcie">
        <Answer label="Logo" value={q.hasLogo == null ? null : q.hasLogo ? "Áno" : "Nie"} />
        <Answer label="Fotky" value={lbl(L.hasPhotos, q.hasPhotos)} />
        <Answer label="Texty" value={lbl(L.hasTexts, q.hasTexts)} />
        <Answer label="Sekcie webu" value={q.requiredSections} />
        <Answer label="Špeciálne funkcie" value={q.specialFeatures} />
        <Answer label="Jazyky" value={q.languages.map((x) => x.toUpperCase())} />
        <Answer label="CMS" value={lbl(L.cmsNeeded, q.cmsNeeded)} />
        <Answer label="Integrácie" value={q.externalIntegrations} />
        <Answer label="Špeciálne požiadavky" value={q.specialRequirements} />
      </Section>
      <Section title="Rezervácie">
        <Answer label="Rezervačný systém" value={lbl(L.bookingNeeded, q.bookingNeeded)} />
        <Answer label="Súčasný proces" value={q.bookingCurrentProcess} />
      </Section>
      <Section title="Projekt">
        <Answer label="Rozpočet" value={q.budget} />
        <Answer label="Termín" value={q.deadline} />
        <Answer label="Doplňujúce info" value={q.additionalInfo} />
      </Section>
      <Section title="Po spustení">
        <Answer label="Údržba" value={lbl(L.maintenanceInterest, q.maintenanceInterest)} />
        <Answer label="SEO" value={lbl(L.seoInterest, q.seoInterest)} />
        <Answer label="Reklama" value={lbl(L.adsInterest, q.adsInterest)} />
        <Answer label="Mesačný rozpočet na reklamu" value={q.monthlyAdsBudget} />
      </Section>
    </div>
  );
}

// ── Checklist ─────────────────────────────────────────────────────────────────
function ChecklistRow({
  item,
  busy,
  action,
  onToggle,
  onNotes,
}: {
  item: ChecklistItemDTO;
  busy: boolean;
  action?: { label: string; onClick: () => void; done?: boolean };
  onToggle: () => void;
  onNotes: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-label={item.completed ? "Odznačiť" : "Označiť ako hotové"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            item.completed ? "border-success bg-success text-white" : "border-border hover:border-primary",
          )}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : item.completed && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm text-foreground", item.completed && "text-muted line-through")}>
            <span className="mr-1 text-xs text-muted">{item.order}.</span>
            {item.title}
          </p>
          {item.completed && item.completedAt && (
            <p className="text-[11px] text-success">Hotové {shortDate(item.completedAt)}</p>
          )}
        </div>
        {action &&
          (action.done ? (
            <Badge variant="success">Hotové</Badge>
          ) : (
            <Button size="sm" variant="secondary" onClick={action.onClick} disabled={busy}>
              {action.label}
            </Button>
          ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-muted hover:text-foreground"
        >
          {open ? "−" : "＋ pozn."}
        </button>
      </div>
      {open && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (item.notes ?? "") && onNotes(notes)}
          rows={2}
          placeholder="Poznámka ku kroku…"
          className="mt-2 w-full rounded border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
        />
      )}
    </div>
  );
}

function InvoiceRow({ inv, onPaid }: { inv: InvoiceDTO; onPaid: (paid: boolean) => void }) {
  const typeLabel = inv.type === "deposit" ? "Záloha" : inv.type === "final" ? "Doplatok" : "Faktúra";
  const overdue = inv.status !== "paid" && new Date(inv.dueDate) < new Date();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {typeLabel} · {money(inv.amount)}
        </p>
        <p className="text-xs text-muted">Splatnosť {shortDate(inv.dueDate)}</p>
      </div>
      <button
        type="button"
        onClick={() => onPaid(inv.status !== "paid")}
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          inv.status === "paid"
            ? "bg-success/15 text-success"
            : overdue
              ? "bg-danger/15 text-danger"
              : "bg-warning/15 text-warning",
        )}
      >
        {inv.status === "paid" ? "Zaplatená ✓" : overdue ? "Po splatnosti" : "Čaká na platbu"}
      </button>
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ProjectSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/projects/${id}`, { cache: "no-store" }).then((r) => r.json());
      if (j.summary) setData(j.summary);
      else toast.error("Projekt sa nenašiel.");
    } catch {
      toast.error("Nepodarilo sa načítať projekt.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patchProject = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.summary) setData(j.summary);
    else toast.error("Zmena sa neuložila.");
  };

  const toggleItem = async (item: ChecklistItemDTO) => {
    setBusyItem(item.id);
    try {
      await fetch(`/api/projects/${id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      await load();
    } finally {
      setBusyItem(null);
    }
  };

  const itemNotes = async (item: ChecklistItemDTO, notes: string) => {
    await fetch(`/api/projects/${id}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
  };

  const generateContract = async () => {
    const r = await fetch(`/api/projects/${id}/contract`, { method: "POST" });
    if (r.ok) {
      toast.success("Zmluva vygenerovaná");
      await load();
    } else {
      const j = await r.json().catch(() => ({}));
      toast.error(j.error === "already_signed" ? "Zmluva je už podpísaná." : "Nepodarilo sa vygenerovať.");
    }
  };

  const generateInvoice = async (type: "deposit" | "final") => {
    const r = await fetch(`/api/projects/${id}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (r.ok) {
      toast.success("Faktúra vytvorená");
      await load();
    } else {
      toast.error("Faktúru sa nepodarilo vytvoriť.");
    }
  };

  const setInvoicePaid = async (invId: string, paid: boolean) => {
    await fetch(`/api/invoices/${invId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: paid ? "paid" : "unpaid" }),
    });
    await load();
  };

  const copy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(msg));
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-surface-2" />;
  if (!data) return <p className="text-sm text-muted">Projekt sa nenašiel.</p>;

  const { project, client, checklist, questionnaire, contract, invoices } = data;
  const qLink = questionnaire && origin ? `${origin}/dotaznik/${questionnaire.token}` : "";
  const cLink = contract && origin ? `${origin}/zmluva/${contract.token}` : "";

  // Akcia pre konkrétny krok checklistu.
  const stepAction = (item: ChecklistItemDTO): { label: string; onClick: () => void; done?: boolean } | undefined => {
    switch (item.step) {
      case "contract":
        return contract
          ? { label: "Zmluva ✓", onClick: () => copy(cLink, "Link na podpis skopírovaný"), done: contract.status === "signed" }
          : { label: "Generovať zmluvu", onClick: generateContract };
      case "deposit":
        return { label: "Generovať zálohu", onClick: () => generateInvoice("deposit") };
      case "invoice":
        return { label: "Generovať doplatok", onClick: () => generateInvoice("final") };
      case "questionnaire":
        return { label: "Kopírovať link", onClick: () => copy(qLink, "Link na dotazník skopírovaný"), done: project.questionnaireDone };
      case "feedback":
        return {
          label: "Napísať email",
          onClick: () => {
            const subj = encodeURIComponent("Ako sa Vám páči nový web?");
            const body = encodeURIComponent(`Dobrý deň ${client.name},\n\nĎakujem za spoluprácu! Budem veľmi vďačný za krátku recenziu.\n\nS pozdravom,\nSamuel`);
            window.location.href = `mailto:${client.email}?subject=${subj}&body=${body}`;
          },
        };
      default:
        return undefined;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/projekty"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-foreground">{project.name}</h1>
          <p className="truncate text-sm text-muted">
            {client.company} · {PROJECT_TYPE_LABEL[project.type] ?? project.type}
          </p>
        </div>
        <Select value={project.status} onValueChange={(v) => patchProject({ status: v })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── ĽAVÝ STĹPEC ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informácie o projekte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted" /> {client.company}
              </p>
              <p className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted" /> {client.name}
              </p>
              {client.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted" />
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                    {client.email}
                  </a>
                </p>
              )}
              {client.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted" /> {client.phone}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <label className="text-xs text-muted">
                  Cena (€)
                  <Input
                    defaultValue={project.price ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (String(project.price ?? "") !== v) patchProject({ price: v });
                    }}
                    inputMode="decimal"
                    className="mt-1"
                  />
                </label>
                <div className="text-xs text-muted">
                  Záloha 30 %
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-foreground">{money(project.depositAmount)}</span>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={project.depositPaid}
                        onChange={(e) => patchProject({ depositPaid: e.target.checked })}
                        className="h-3.5 w-3.5 accent-success"
                      />
                      zaplatená
                    </label>
                  </div>
                </div>
                <label className="text-xs text-muted">
                  Začiatok
                  <Input type="date" defaultValue={dateInput(project.startDate)} onBlur={(e) => patchProject({ startDate: e.target.value })} className="mt-1" />
                </label>
                <label className="text-xs text-muted">
                  Deadline
                  <Input type="date" defaultValue={dateInput(project.deadline)} onBlur={(e) => patchProject({ deadline: e.target.value })} className="mt-1" />
                </label>
              </div>

              <label className="block border-t border-border pt-3 text-xs text-muted">
                Poznámky
                <textarea
                  defaultValue={project.notes ?? ""}
                  onBlur={(e) => {
                    if ((project.notes ?? "") !== e.target.value) patchProject({ notes: e.target.value });
                  }}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                Onboarding checklist
                <span className="text-sm font-normal text-muted">
                  {project.checklistDone}/{project.checklistTotal}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {checklist.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  busy={busyItem === item.id}
                  action={stepAction(item)}
                  onToggle={() => toggleItem(item)}
                  onNotes={(n) => itemNotes(item, n)}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── PRAVÝ STĹPEC ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-muted" />
                Dokumenty
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* Zmluva */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <div>
                  <p className="font-medium text-foreground">Zmluva</p>
                  <p className="text-xs text-muted">
                    {contract
                      ? contract.status === "signed"
                        ? `Podpísaná ${shortDate(contract.signedAt)} (${contract.signedByName ?? ""})`
                        : "Čaká na podpis"
                      : "Zatiaľ nevygenerovaná"}
                  </p>
                </div>
                {contract ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copy(cLink, "Link skopírovaný")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <a href={cLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="secondary">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Otvoriť
                      </Button>
                    </a>
                  </div>
                ) : (
                  <Button size="sm" onClick={generateContract}>
                    Generovať
                  </Button>
                )}
              </div>

              {/* Dotazník */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <div>
                  <p className="font-medium text-foreground">Dotazník</p>
                  <p className="text-xs text-muted">{project.questionnaireDone ? "Vyplnený ✓" : "Čaká na vyplnenie"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => copy(qLink, "Link na dotazník skopírovaný")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <a href={qLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="secondary">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Otvoriť
                    </Button>
                  </a>
                </div>
              </div>

              {/* Faktúry */}
              <div className="border-t border-border pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Receipt className="h-3.5 w-3.5" />
                    Faktúry
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => generateInvoice("deposit")}>
                      + Záloha
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => generateInvoice("final")}>
                      + Doplatok
                    </Button>
                  </div>
                </div>
                {invoices.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted">Žiadne faktúry.</p>
                ) : (
                  <div className="space-y-1.5">
                    {invoices.map((inv) => (
                      <InvoiceRow key={inv.id} inv={inv} onPaid={(paid) => setInvoicePaid(inv.id, paid)} />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Odpovede z dotazníka</CardTitle>
            </CardHeader>
            <CardContent>
              {questionnaire && project.questionnaireDone ? (
                <QuestionnaireView q={questionnaire} />
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted">Dotazník ešte nie je vyplnený.</p>
                  {qLink && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => copy(qLink, "Link skopírovaný")}>
                      <Copy className="h-3.5 w-3.5" />
                      Skopírovať link pre klienta
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
