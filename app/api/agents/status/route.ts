import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAgentSnapshots } from "@/lib/agents/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/status — živý stav všetkých agentov (počíta sa z reálnych dát). */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const agents = await getAgentSnapshots();
  return NextResponse.json({ agents, at: new Date().toISOString() });
}
