import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getProjectSummary } from "@/lib/onboarding/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/summary — kompletný prehľad projektu. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const summary = await getProjectSummary(id);
  if (!summary)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ summary });
}
