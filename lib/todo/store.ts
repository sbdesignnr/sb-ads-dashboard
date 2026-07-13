import type { Goal, Task } from "@prisma/client";
import type { GoalDTO, GoalStatus, TaskDTO } from "./types";
import { type Period, type Priority, toDayKey, PRIORITY_RANK } from "./period";

type TaskWithGoal = Task & { goal?: { title: string } | null };
type GoalWithCounts = Goal & { tasks?: { done: boolean }[] };

export function serializeTask(t: TaskWithGoal): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    // Stĺpec je typu `date` → Prisma vracia polnoc v UTC. Čítame ho v UTC, inak
    // by sa deň v západných zónach posunul o jeden dozadu.
    date: t.date ? toDayKey(t.date, true) : null,
    time: t.time,
    priority: t.priority as Priority,
    done: t.done,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    goalId: t.goalId,
    goalTitle: t.goal?.title ?? null,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeGoal(g: GoalWithCounts): GoalDTO {
  const tasks = g.tasks ?? [];
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    period: g.period as Period,
    periodKey: g.periodKey,
    priority: g.priority as Priority,
    status: g.status as GoalStatus,
    progress: g.progress,
    doneAt: g.doneAt ? g.doneAt.toISOString() : null,
    taskCount: tasks.length,
    taskDone: tasks.filter((t) => t.done).length,
    createdAt: g.createdAt.toISOString(),
  };
}

/**
 * Poradie v dennom pláne: najprv úlohy s časom (chronologicky), potom tie bez
 * času; v rámci rovnakého času rozhoduje priorita. Hotové padajú naspodok, aby
 * neprekážali — ale ostávajú viditeľné.
 */
export function sortTasks(tasks: TaskDTO[]): TaskDTO[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.time && b.time) {
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    } else if (a.time !== b.time) {
      return a.time ? -1 : 1; // úlohy s časom idú pred tie bez neho
    }
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}
