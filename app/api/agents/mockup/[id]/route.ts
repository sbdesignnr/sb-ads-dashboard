import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/agents/mockup/[id] — zmaže návrh (verejný odkaz prestane fungovať). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.leadMockup.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
