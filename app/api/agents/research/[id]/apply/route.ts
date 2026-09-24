import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyResearchEmail } from "@/lib/agents/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/agents/research/[id]/apply { force? } — mail z výskumu sa stane konceptom na schválenie. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  const r = await applyResearchEmail(id, Boolean(force));
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r);
}
