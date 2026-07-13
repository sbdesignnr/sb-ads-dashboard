import type { Period, Priority } from "./period";

export type GoalStatus = "active" | "done" | "dropped";

export interface TaskDTO {
  id: string;
  title: string;
  notes: string;
  /** "YYYY-MM-DD" — deň, na ktorý je naplánovaná; null = Nezaradené. */
  date: string | null;
  /** "09:30" — null pri úlohe bez presného času. */
  time: string | null;
  priority: Priority;
  done: boolean;
  doneAt: string | null;
  goalId: string | null;
  goalTitle: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface GoalDTO {
  id: string;
  title: string;
  description: string;
  period: Period;
  periodKey: string;
  priority: Priority;
  status: GoalStatus;
  /** Ručný postup 0–100. Používa sa len ak cieľ nemá naviazané úlohy. */
  progress: number;
  doneAt: string | null;
  /** Počty naviazaných úloh — z nich sa počíta reálny postup. */
  taskCount: number;
  taskDone: number;
  createdAt: string;
}

/**
 * Skutočný postup cieľa. Ak má naviazané úlohy, počíta sa z nich — ručný
 * posuvník by inak klamal. Bez úloh padáme späť na ručnú hodnotu.
 */
export function goalProgress(
  g: Pick<GoalDTO, "taskCount" | "taskDone" | "progress">,
): number {
  if (g.taskCount === 0) return Math.max(0, Math.min(100, g.progress));
  return Math.round((g.taskDone / g.taskCount) * 100);
}
