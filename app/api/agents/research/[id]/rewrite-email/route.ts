import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { rewriteEmailWithMockup } from "@/lib/agents/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** POST /api/agents/research/[id]/rewrite-email { mockupId? } — mail znova, s odkazom na hotový návrh stránky. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { mockupId } = (await req.json().catch(() => ({}))) as { mockupId?: string };
  const r = await rewriteEmailWithMockup(id, mockupId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
