import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/mockup/[id]/hero[?full=1] — screenshot návrhu pre pracovňu (len prihlásený). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const full = req.nextUrl.searchParams.get("full") === "1";
  const row = await prisma.leadMockup.findUnique({ where: { id }, select: { heroJpg: true, fullJpg: true } });
  const buf = full ? row?.fullJpg : row?.heroJpg;
  if (!buf) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
