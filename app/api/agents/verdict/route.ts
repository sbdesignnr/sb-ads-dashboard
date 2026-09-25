import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listNotes } from "@/lib/agents/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/verdict?leadId=… — odôvodnenie Skauta a jeho poznámky k jednému leadu. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "Chýba leadId." }, { status: 400 });
  const notes = await listNotes({ leadId }, 12);
  const verdict = notes.find((n) => n.kind === "verdict") ?? null;
  return NextResponse.json({
    verdict: verdict ? { at: verdict.createdAt, ...(verdict.data as object) } : null,
    notes: notes.filter((n) => n.kind !== "verdict").map((n) => ({ at: n.createdAt, agent: n.agent, kind: n.kind, title: n.title, body: n.body })),
  });
}
