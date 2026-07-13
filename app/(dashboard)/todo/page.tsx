"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Target,
  AlertTriangle,
  Inbox,
  X,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type Period,
  type Priority,
  PERIODS,
  PERIOD_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  addDays,
  dayLabel,
  daysLeftIn,
  formatDay,
  periodKeyFor,
  periodLabel,
  toDayKey,
} from "@/lib/todo/period";
import { type GoalDTO, type TaskDTO, goalProgress } from "@/lib/todo/types";

// ── Priorita ─────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-danger",
  high: "bg-warning",
  normal: "bg-primary",
  low: "bg-muted",
};

function PriorityDot({ p }: { p: Priority }) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PRIORITY_DOT[p])}
      title={PRIORITY_LABEL[p]}
    />
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Priority)}>
      <SelectTrigger className="w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="flex items-center gap-2">
              <PriorityDot p={p} />
              {PRIORITY_LABEL[p]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Riadok úlohy ─────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onToggle,
  onOpen,
  overdue,
}: {
  task: TaskDTO;
  onToggle: (t: TaskDTO) => void;
  onOpen: (t: TaskDTO) => void;
  overdue?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors",
        task.done && "opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label={task.done ? "Odznačiť" : "Označiť ako hotové"}
        className={cn(
          "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
          task.done
            ? "border-success bg-success text-white"
            : "border-border hover:border-primary",
        )}
      >
        {task.done && <Check className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={() => onOpen(task)}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <PriorityDot p={task.priority} />
          <span
            className={cn(
              "truncate text-sm text-foreground",
              task.done && "line-through",
            )}
          >
            {task.title}
          </span>
        </div>
        {(task.goalTitle || task.notes) && (
          <p className="mt-0.5 truncate text-xs text-muted">
            {task.goalTitle ? `🎯 ${task.goalTitle}` : task.notes}
          </p>
        )}
      </button>

      {overdue && task.date && (
        <span className="shrink-0 text-xs text-danger" title="Pôvodný termín">
          {task.date.slice(8)}. {task.date.slice(5, 7)}.
        </span>
      )}
      {task.time && (
        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted">
          <Clock className="h-3 w-3" />
          {task.time}
        </span>
      )}
    </div>
  );
}

// ── Editor úlohy (modal) ─────────────────────────────────────────────────────

function TaskEditor({
  task,
  goals,
  onSave,
  onDelete,
  onClose,
}: {
  task: TaskDTO;
  goals: GoalDTO[];
  onSave: (patch: Partial<TaskDTO>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [time, setTime] = useState(task.time ?? "");
  const [date, setDate] = useState(task.date ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [goalId, setGoalId] = useState(task.goalId ?? "none");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast.error("Úloha potrebuje názov.");
    setBusy(true);
    try {
      await onSave({
        title: title.trim(),
        notes,
        time: time || null,
        date: date || null,
        priority,
        goalId: goalId === "none" ? null : goalId,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Upraviť úlohu</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Čo treba spraviť?"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Dátum</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Čas</label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Priorita</label>
              <PrioritySelect value={priority} onChange={setPriority} />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs text-muted">Cieľ</label>
              <Select value={goalId} onValueChange={setGoalId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez cieľa</SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {PERIOD_LABEL[g.period]}: {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">Poznámka</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Detaily, odkazy, kontext…"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={busy}
              className="text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Zmazať
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Uložiť
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Karta cieľa ──────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  today,
  onPatch,
  onDelete,
}: {
  goal: GoalDTO;
  today: string;
  onPatch: (patch: Partial<GoalDTO>) => void;
  onDelete: () => void;
}) {
  const pct = goalProgress(goal);
  const stale = goal.periodKey !== periodKeyFor(goal.period, today);
  const left = daysLeftIn(goal.period, goal.periodKey, today);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3",
        goal.status === "done" && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() =>
            onPatch({ status: goal.status === "done" ? "active" : "done" })
          }
          aria-label={goal.status === "done" ? "Otvoriť cieľ" : "Splniť cieľ"}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
            goal.status === "done"
              ? "border-success bg-success text-white"
              : "border-border hover:border-primary",
          )}
        >
          {goal.status === "done" && <Check className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityDot p={goal.priority} />
            <span
              className={cn(
                "text-sm font-medium text-foreground",
                goal.status === "done" && "line-through",
              )}
            >
              {goal.title}
            </span>
            {stale && goal.status === "active" && (
              <Badge variant="danger" className="text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                {periodLabel(goal.period, goal.periodKey)}
              </Badge>
            )}
          </div>
          {goal.description && (
            <p className="mt-1 text-xs text-muted">{goal.description}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct === 100 ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {pct}%
            </span>
          </div>

          <p className="mt-1.5 text-xs text-muted">
            {goal.taskCount > 0 ? (
              <>
                {goal.taskDone}/{goal.taskCount} úloh hotových
              </>
            ) : (
              <span className="text-warning">
                Žiadne úlohy — cieľ sa sám nesplní
              </span>
            )}
            {!stale && goal.status === "active" && (
              <>
                {" "}
                · zostáva {left} {left === 1 ? "deň" : left < 5 ? "dni" : "dní"}
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label="Zmazať cieľ"
          className="shrink-0 cursor-pointer rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Stránka ──────────────────────────────────────────────────────────────────

export default function TodoPage() {
  // "Dnes" sa určuje z hodín prehliadača — a raz, pri načítaní, aby sa deň
  // neprepočítaval pri každom rendere.
  const [today] = useState(() => toDayKey(new Date()));
  const [day, setDay] = useState(today);

  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [overdue, setOverdue] = useState<TaskDTO[]>([]);
  const [inbox, setInbox] = useState<TaskDTO[]>([]);
  const [goals, setGoals] = useState<GoalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TaskDTO | null>(null);

  // Rýchle pridanie
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("normal");
  const [newGoal, setNewGoal] = useState("none");
  const [adding, setAdding] = useState(false);

  // Nový cieľ
  const [goalPeriod, setGoalPeriod] = useState<Period | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalPriority, setGoalPriority] = useState<Priority>("normal");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, g] = await Promise.all([
        fetch(`/api/todo/tasks?date=${day}`).then((r) => r.json()),
        fetch(`/api/todo/goals?date=${day}`).then((r) => r.json()),
      ]);
      setTasks(t.tasks ?? []);
      setOverdue(t.overdue ?? []);
      setInbox(t.inbox ?? []);
      setGoals(g.goals ?? []);
    } catch {
      toast.error("Nepodarilo sa načítať úlohy.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active"),
    [goals],
  );

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todo/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          date: day,
          time: newTime || null,
          priority: newPriority,
          goalId: newGoal === "none" ? null : newGoal,
        }),
      });
      if (!res.ok) throw new Error();
      setNewTitle("");
      setNewTime("");
      await load();
    } catch {
      toast.error("Úlohu sa nepodarilo pridať.");
    } finally {
      setAdding(false);
    }
  };

  // Odškrtnutie prekreslí zoznam okamžite a až potom to potvrdí server — pri
  // zlyhaní sa vrátime späť. Bez toho každý klik čaká na sieť.
  const toggle = async (t: TaskDTO) => {
    const next = !t.done;
    const patch = (list: TaskDTO[]) =>
      list.map((x) => (x.id === t.id ? { ...x, done: next } : x));
    setTasks(patch);
    setOverdue(patch);
    setInbox(patch);
    try {
      const res = await fetch(`/api/todo/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
      if (!res.ok) throw new Error();
      await load(); // zosúladí poradie + postup cieľov
    } catch {
      toast.error("Zmena sa neuložila.");
      await load();
    }
  };

  const saveTask = async (id: string, patch: Partial<TaskDTO>) => {
    const res = await fetch(`/api/todo/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Zmena sa neuložila.");
      return;
    }
    await load();
  };

  const deleteTask = async (id: string) => {
    await fetch(`/api/todo/tasks/${id}`, { method: "DELETE" });
    setEditing(null);
    await load();
  };

  const moveOverdueToDay = async () => {
    const ids = overdue.filter((t) => !t.done).map((t) => t.id);
    if (!ids.length) return;
    const res = await fetch("/api/todo/tasks/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, date: day }),
    });
    if (!res.ok) return toast.error("Presun zlyhal.");
    toast.success(`Presunuté: ${ids.length}`);
    await load();
  };

  const addGoal = async (period: Period) => {
    const title = goalTitle.trim();
    if (!title) return;
    const res = await fetch("/api/todo/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        period,
        priority: goalPriority,
        date: day,
      }),
    });
    if (!res.ok) return toast.error("Cieľ sa nepodarilo pridať.");
    setGoalTitle("");
    setGoalPeriod(null);
    setGoalPriority("normal");
    await load();
  };

  const patchGoal = async (id: string, patch: Partial<GoalDTO>) => {
    const res = await fetch(`/api/todo/goals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return toast.error("Zmena sa neuložila.");
    await load();
  };

  const deleteGoal = async (id: string) => {
    await fetch(`/api/todo/goals/${id}`, { method: "DELETE" });
    await load();
  };

  const doneCount = tasks.filter((t) => t.done).length;
  const openOverdue = overdue.filter((t) => !t.done);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Deň
          </TabsTrigger>
          <TabsTrigger value="goals">
            <Target className="mr-1.5 h-4 w-4" />
            Ciele
          </TabsTrigger>
        </TabsList>

        {/* ── DEŇ ────────────────────────────────────────────────────────── */}
        <TabsContent value="day" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDay(addDays(day, -1))}
                    aria-label="Predošlý deň"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[150px] text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {dayLabel(day, today)}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDay(day, today)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDay(addDays(day, 1))}
                    aria-label="Ďalší deň"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {day !== today && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDay(today)}
                    >
                      Dnes
                    </Button>
                  )}
                </div>
                <Badge
                  variant={
                    tasks.length && doneCount === tasks.length
                      ? "success"
                      : "default"
                  }
                >
                  {doneCount}/{tasks.length} hotových
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Rýchle pridanie */}
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="Čo treba spraviť?"
                  className="min-w-[180px] flex-1"
                />
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-[110px]"
                  aria-label="Čas"
                />
                <PrioritySelect value={newPriority} onChange={setNewPriority} />
                {activeGoals.length > 0 && (
                  <Select value={newGoal} onValueChange={setNewGoal}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Cieľ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bez cieľa</SelectItem>
                      {activeGoals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button onClick={addTask} disabled={adding || !newTitle.trim()}>
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Pridať
                </Button>
              </div>

              {/* Po termíne */}
              {openOverdue.length > 0 && (
                <div className="rounded-lg border border-danger/40 bg-danger/5 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-danger">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Po termíne ({openOverdue.length})
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={moveOverdueToDay}
                    >
                      Presunúť na {day === today ? "dnes" : "tento deň"}
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {openOverdue.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={toggle}
                        onOpen={setEditing}
                        overdue
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Úlohy dňa */}
              {loading ? (
                <p className="py-6 text-center text-sm text-muted">
                  Načítavam…
                </p>
              ) : tasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  Na tento deň nemáš nič naplánované. Napíš prvú úlohu vyššie.
                </p>
              ) : (
                <div className="space-y-1">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggle={toggle}
                      onOpen={setEditing}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nezaradené */}
          {inbox.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Inbox className="h-4 w-4 text-muted" />
                  Nezaradené ({inbox.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="pb-2 text-xs text-muted">
                  Úlohy bez dátumu. Klikni na ňu a prideľ jej deň.
                </p>
                <div className="space-y-1">
                  {inbox.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggle={toggle}
                      onOpen={setEditing}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── CIELE ──────────────────────────────────────────────────────── */}
        <TabsContent value="goals" className="mt-4 space-y-4">
          {PERIODS.map((period) => {
            const list = goals.filter((g) => g.period === period);
            const key = periodKeyFor(period, day);
            return (
              <Card key={period}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-primary" />
                      {PERIOD_LABEL[period]} ciele
                      <span className="font-normal text-muted">
                        · {periodLabel(period, key)}
                      </span>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setGoalPeriod(goalPeriod === period ? null : period);
                        setGoalTitle("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Pridať
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {goalPeriod === period && (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-2/40 p-2">
                      <Input
                        value={goalTitle}
                        onChange={(e) => setGoalTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addGoal(period)}
                        placeholder={
                          period === "week"
                            ? "Napr. Osloviť 30 nových leadov"
                            : period === "month"
                              ? "Napr. Publikovať 4 články"
                              : "Napr. Dosiahnuť 50 000 € obratu"
                        }
                        className="min-w-[200px] flex-1"
                        autoFocus
                      />
                      <PrioritySelect
                        value={goalPriority}
                        onChange={setGoalPriority}
                      />
                      <Button
                        onClick={() => addGoal(period)}
                        disabled={!goalTitle.trim()}
                      >
                        <Check className="h-4 w-4" />
                        Uložiť
                      </Button>
                    </div>
                  )}

                  {list.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted">
                      Žiadne {PERIOD_LABEL[period].toLowerCase()} ciele.
                    </p>
                  ) : (
                    list.map((g) => (
                      <GoalCard
                        key={g.id}
                        goal={g}
                        today={day}
                        onPatch={(p) => patchGoal(g.id, p)}
                        onDelete={() => deleteGoal(g.id)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {editing && (
        <TaskEditor
          task={editing}
          goals={activeGoals}
          onSave={(patch) => saveTask(editing.id, patch)}
          onDelete={() => deleteTask(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
