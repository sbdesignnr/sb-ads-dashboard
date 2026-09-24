import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /nahlad/[token]/hero.jpg — verejný screenshot návrhu (napr. do náhľadu odkazu). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{16,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const row = await prisma.leadMockup.findUnique({ where: { token }, select: { heroJpg: true, status: true } });
  if (!row?.heroJpg || row.status !== "done") return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.heroJpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" } });
}
