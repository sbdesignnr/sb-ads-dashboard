import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/todo/store";
import { fromDayKey, isDayKey, isPriority } from "@/lib/todo/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withGoal = { goal: { select: { title: true } } };

/** PATCH /api/todo/tasks/[id] — odškrtnutie, presun, zmena priority/času/textu. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof b.title === "string" && b.title.trim())
    data.title = b.title.trim();
  if (typeof b.notes === "string") data.notes = b.notes;
  if (isPriority(b.priority)) data.priority = b.priority;

  // Odškrtnutie si so sebou nesie čas — z toho sa dá neskôr počítať štatistika.
  if (typeof b.done === "boolean") {
    data.done = b.done;
    data.doneAt = b.done ? new Date() : null;
  }

  // `date: null` je platná hodnota (= presun do Nezaradených), takže rozlišujeme
  // "kľúč vôbec neprišiel" od "prišiel s null".
  if ("date" in b) {
    if (b.date === null) data.date = null;
    else if (isDayKey(b.date)) data.date = fromDayKey(b.date);
    else return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  if ("time" in b) {
    if (b.time === null || b.time === "") data.time = null;
    else if (/^\d{2}:\d{2}$/.test(String(b.time))) data.time = String(b.time);
    else return NextResponse.json({ error: "invalid_time" }, { status: 400 });
  }
  if ("goalId" in b) {
    data.goalId = typeof b.goalId === "string" && b.goalId ? b.goalId : null;
  }

  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const task = await prisma.task.update({
      where: { id },
      data,
      include: withGoal,
    });
    return NextResponse.json({ task: serializeTask(task) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/** DELETE /api/todo/tasks/[id] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
