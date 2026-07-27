import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeChecklistItem } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/checklist — pridá vlastný krok na koniec. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: { title?: unknown; step?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = String(b.title ?? "").trim();
  if (!title)
    return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const last = await prisma.checklistItem.aggregate({
    where: { projectId: id },
    _max: { order: true },
  });
  const item = await prisma.checklistItem.create({
    data: {
      projectId: id,
      step: String(b.step ?? "custom").trim() || "custom",
      title,
      order: (last._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(
    { item: serializeChecklistItem(item) },
    { status: 201 },
  );
}
