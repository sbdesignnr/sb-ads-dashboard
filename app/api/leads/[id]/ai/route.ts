import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateEmail } from "@/lib/leads/ai";
import { enrichLead } from "@/lib/leads/scanner";
import { serializeLead } from "@/lib/leads/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  }
  const { id } = await params;
  let body: { type?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* default */
  }
  const type = body.type === "email" ? "email" : "analysis";

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const segment = lead.segmentId ? await prisma.leadSegment.findUnique({ where: { id: lead.segmentId } }) : null;

  try {
    if (type === "email") {
      const text = await generateEmail(lead, { name: segment?.name ?? "firma", communicationStyle: segment?.communicationStyle });
      return NextResponse.json({ text });
    }
    // Re-run the full enrichment (scrape contacts + analyze + ORSR + dossier) and persist.
    await enrichLead(id, { id: segment?.id ?? "", name: segment?.name ?? "firma", communicationStyle: segment?.communicationStyle ?? null });
    const updated = await prisma.lead.findUnique({ where: { id } });
    return NextResponse.json({ lead: updated ? serializeLead(updated) : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
