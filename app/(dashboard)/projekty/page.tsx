"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Loader2, X, Calendar, CircleDollarSign, ListChecks } from "lucide-react";
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
import { money, shortDate } from "@/lib/onboarding/format";
import {
  PROJECT_STATUSES,
  PROJECT_TYPE_LABEL,
  type ProjectDTO,
  type ClientDTO,
  type ProjectStatus,
} from "@/lib/onboarding/types";

// Farebný accent stĺpca/karty podľa statusu.
const STATUS_ACCENT: Record<string, string> = {
  discovery: "border-l-slate-400",
  proposal: "border-l-sky-400",
  contract: "border-l-indigo-400",
  onboarding: "border-l-violet-400",
  design: "border-l-pink-400",
  development: "border-l-amber-400",
  review: "border-l-orange-400",
  launch: "border-l-emerald-400",
  completed: "border-l-green-500",
};
const TYPE_VARIANT: Record<string, "info" | "purple" | "success" | "default"> = {
  web: "info",
  eshop: "purple",
  marketing: "success",
  other: "default",
};

function ProjectCard({
  project,
  onOpen,
  onStatus,
}: {
  project: ProjectDTO;
  onOpen: () => void;
  onStatus: (status: ProjectStatus) => void;
}) {
  const pct = project.checklistTotal ? Math.round((project.checklistDone / project.checklistTotal) * 100) : 0;
  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-2 bg-surface p-3 transition-colors hover:border-primary/40",
        STATUS_ACCENT[project.status] ?? "border-l-border",
      )}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <p className="truncate text-xs text-muted">{project.clientCompany}</p>
        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={TYPE_VARIANT[project.type] ?? "default"}>{PROJECT_TYPE_LABEL[project.type] ?? project.type}</Badge>
          {project.price != null && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <CircleDollarSign className="h-3 w-3" />
              {money(project.price)}
            </span>
          )}
        </div>
        {project.deadline && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted">
            <Calendar className="h-3 w-3" />
            {shortDate(project.deadline)}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <ListChecks className="h-3 w-3" />
            {project.checklistDone}/{project.checklistTotal}
          </span>
        </div>
      </button>

      {/* Rýchla zmena statusu priamo z boardu (bez drag&drop). */}
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <Select value={project.status} onValueChange={(v) => onStatus(v as ProjectStatus)}>
          <SelectTrigger className="h-7 text-xs">
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
    </div>
  );
}

function NewProjectModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientDTO[];
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState("");
  const [company, setCompany] = useState("");
  const [name, setName] = useState(""); // kontaktná osoba (nový klient)
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // projekt
  const [projectName, setProjectName] = useState("");
  const [type, setType] = useState("web");
  const [price, setPrice] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!projectName.trim()) return toast.error("Zadaj názov projektu.");
    if (mode === "existing" && !clientId) return toast.error("Vyber klienta.");
    if (mode === "new" && !company.trim()) return toast.error("Zadaj názov firmy klienta.");
    setSaving(true);
    try {
      const body =
        mode === "existing"
          ? { clientId, name: projectName.trim(), type, price, deadline, notes }
          : {
              client: { company: company.trim(), name: name.trim(), email: email.trim(), phone: phone.trim() },
              name: projectName.trim(),
              type,
              price,
              deadline,
              notes,
            };
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.project) {
        toast.error(j.error || "Projekt sa nepodarilo vytvoriť.");
        return;
      }
      toast.success("Projekt vytvorený");
      onCreated(j.project.id);
    } catch {
      toast.error("Projekt sa nepodarilo vytvoriť.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Nový projekt</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          {/* Klient */}
          <div>
            <label className="mb-1 block text-xs text-muted">Klient</label>
            <div className="mb-2 inline-flex rounded-lg border border-border bg-surface-2 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("existing")}
                disabled={!clients.length}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors disabled:opacity-40",
                  mode === "existing" ? "bg-surface text-foreground shadow-sm" : "text-muted",
                )}
              >
                Existujúci
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  mode === "new" ? "bg-surface text-foreground shadow-sm" : "text-muted",
                )}
              >
                Nový klient
              </button>
            </div>

            {mode === "existing" ? (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyber klienta…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company}
                      {c.name && c.name !== c.company ? ` · ${c.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Názov firmy *" />
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kontaktná osoba" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefón" />
                </div>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Projekt */}
          <div>
            <label className="mb-1 block text-xs text-muted">Názov projektu *</label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="napr. Nový web pre reštauráciu" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Typ projektu</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_TYPE_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Orientačná cena (€)</label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="napr. 1500" inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Deadline</label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Poznámka</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Interná poznámka…"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {price && (
            <p className="text-xs text-muted">
              Záloha 30 %: <strong className="text-foreground">{money(Math.round(Number(price) * 0.3 * 100) / 100 || null)}</strong> · pri
              vytvorení sa automaticky pridá 12-krokový checklist a dotazník.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Zrušiť
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Vytvoriť projekt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjektyPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        fetch("/api/projects").then((r) => r.json()),
        fetch("/api/clients").then((r) => r.json()),
      ]);
      setProjects(p.projects ?? []);
      setClients(c.clients ?? []);
    } catch {
      toast.error("Projekty sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map = new Map<string, ProjectDTO[]>();
    for (const s of PROJECT_STATUSES) map.set(s.value, []);
    for (const p of projects) (map.get(p.status) ?? map.set(p.status, []).get(p.status)!).push(p);
    return map;
  }, [projects]);

  const changeStatus = async (project: ProjectDTO, status: ProjectStatus) => {
    setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, status } : p)));
    const r = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      toast.error("Zmena statusu zlyhala.");
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projekty</h1>
          <p className="text-sm text-muted">Onboarding klientov od dopytu po spustenie.</p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus className="h-4 w-4" />
          Nový klient / projekt
        </Button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted">Zatiaľ žiadne projekty. Vytvor prvý cez „Nový klient / projekt".</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {PROJECT_STATUSES.map((s) => {
            const items = byStatus.get(s.value) ?? [];
            return (
              <div key={s.value} className="flex w-64 shrink-0 flex-col">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2 rounded-lg bg-surface-2/30 p-2">
                  {items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">—</p>
                  ) : (
                    items.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        onOpen={() => router.push(`/projekty/${p.id}`)}
                        onStatus={(st) => changeStatus(p, st)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <NewProjectModal
          clients={clients}
          onClose={() => setModal(false)}
          onCreated={(id) => router.push(`/projekty/${id}`)}
        />
      )}
    </div>
  );
}
