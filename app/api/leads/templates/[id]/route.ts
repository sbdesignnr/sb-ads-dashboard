import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/leads/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/leads/templates/[id] — úprava šablóny, alebo `{ incrementUse: true }`
 * na započítanie použitia (na zoradenie „najčastejšie použité").
 */
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

  // Rýchla cesta: len započítať použitie (fire-and-forget z pickeru).
  if (b.incrementUse === true) {
    try {
      const t = await prisma.emailTemplate.update({
        where: { id },
        data: { useCount: { increment: 1 } },
      });
      return NextResponse.json({ template: serializeTemplate(t) });
    } catch {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim())
    data.name = b.name.trim().slice(0, 120);
  if (typeof b.subject === "string")
    data.subject = b.subject.trim().slice(0, 300);
  if (typeof b.body === "string" && b.body.trim()) data.body = b.body;
  if (typeof b.category === "string")
    data.category = b.category.trim().slice(0, 60);
  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const t = await prisma.emailTemplate.update({ where: { id }, data });
    return NextResponse.json({ template: serializeTemplate(t) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/** DELETE /api/leads/templates/[id] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
