import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTask, sortTasks } from "@/lib/todo/store";
import { fromDayKey, isDayKey, isPriority } from "@/lib/todo/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withGoal = { goal: { select: { title: true } } };

/**
 * GET /api/todo/tasks?date=YYYY-MM-DD
 *
 * Vráti všetko, čo denný pohľad potrebuje, jedným dopytom:
 *  - `tasks`   — úlohy na daný deň
 *  - `overdue` — nesplnené úlohy z minulých dní (inak by ticho zmizli z plánu)
 *  - `inbox`   — úlohy bez dátumu (Nezaradené)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!isDayKey(dateParam))
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  const day = fromDayKey(dateParam);

  const [tasks, overdue, inbox] = await Promise.all([
    prisma.task.findMany({ where: { date: day }, include: withGoal }),
    // Po termíne sa počíta voči zobrazenému dňu, nie voči "dnes" — pri listovaní
    // do minulosti tak nevidíš ako "zmeškané" niečo, čo vtedy ešte nebolo.
    prisma.task.findMany({
      where: { done: false, date: { lt: day } },
      include: withGoal,
    }),
    prisma.task.findMany({
      where: { date: null, done: false },
      include: withGoal,
    }),
  ]);

  return NextResponse.json({
    tasks: sortTasks(tasks.map(serializeTask)),
    overdue: sortTasks(overdue.map(serializeTask)),
    inbox: sortTasks(inbox.map(serializeTask)),
  });
}

/** POST /api/todo/tasks — nová úloha. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = String(b.title ?? "").trim();
  if (!title)
    return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const date = isDayKey(b.date) ? fromDayKey(b.date) : null;
  const time = /^\d{2}:\d{2}$/.test(String(b.time ?? ""))
    ? String(b.time)
    : null;
  const priority = isPriority(b.priority) ? b.priority : "normal";
  const goalId = typeof b.goalId === "string" && b.goalId ? b.goalId : null;

  const task = await prisma.task.create({
    data: {
      title,
      notes: String(b.notes ?? ""),
      date,
      time,
      priority,
      goalId,
      sortOrder: Number(b.sortOrder ?? 0) || 0,
    },
    include: withGoal,
  });

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}
