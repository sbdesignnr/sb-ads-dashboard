import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeGoal } from "@/lib/todo/store";
import { isPriority } from "@/lib/todo/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withTasks = { tasks: { select: { done: true } } };
const STATUSES = ["active", "done", "dropped"];

/** PATCH /api/todo/goals/[id] — text, priorita, stav, ručný postup. */
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
  if (typeof b.description === "string") data.description = b.description;
  if (isPriority(b.priority)) data.priority = b.priority;
  if (typeof b.status === "string" && STATUSES.includes(b.status)) {
    data.status = b.status;
    data.doneAt = b.status === "done" ? new Date() : null;
  }
  if (typeof b.progress === "number" && Number.isFinite(b.progress)) {
    data.progress = Math.max(0, Math.min(100, Math.round(b.progress)));
  }

  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const goal = await prisma.goal.update({
      where: { id },
      data,
      include: withTasks,
    });
    return NextResponse.json({ goal: serializeGoal(goal) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/**
 * DELETE /api/todo/goals/[id] — cieľ sa zmaže, naviazané úlohy NIE (schéma má
 * onDelete: SetNull). Zrušený cieľ nesmie zmazať prácu, ktorú si už spravil.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
