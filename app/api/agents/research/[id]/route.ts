import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/research/[id] — celý záznam behu (brief so zdrojmi + mail). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = await prisma.leadResearch.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          companyName: true,
          companyCity: true,
          websiteUrl: true,
          companyEmail: true,
          websiteScore: true,
        },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ run });
}

/** DELETE /api/agents/research/[id] — zahodí výskum (koncept mailu, ak už vznikol, ostáva). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.leadResearch.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
