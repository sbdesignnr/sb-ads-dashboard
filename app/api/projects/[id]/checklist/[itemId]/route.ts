import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeChecklistItem } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/projects/[id]/checklist/[itemId] — odškrtnutie, poznámka, termín, názov. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { itemId } = await ctx.params;

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Prisma.ChecklistItemUpdateInput = {};
  if (typeof b.completed === "boolean") {
    data.completed = b.completed;
    data.completedAt = b.completed ? new Date() : null;
  }
  if (typeof b.title === "string" && b.title.trim())
    data.title = b.title.trim();
  if (typeof b.notes === "string") data.notes = b.notes.trim() || null;
  if ("dueDate" in b) {
    if (b.dueDate === null || b.dueDate === "") data.dueDate = null;
    else {
      const d = new Date(b.dueDate as string);
      if (Number.isNaN(d.getTime()))
        return NextResponse.json({ error: "invalid_dueDate" }, { status: 400 });
      data.dueDate = d;
    }
  }
  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const item = await prisma.checklistItem.update({
      where: { id: itemId },
      data,
    });
    return NextResponse.json({ item: serializeChecklistItem(item) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/** DELETE /api/projects/[id]/checklist/[itemId] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { itemId } = await ctx.params;
  try {
    await prisma.checklistItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
