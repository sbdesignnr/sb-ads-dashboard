import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { briefFromLead, generateEmail } from "@/lib/leads/ai";

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
  const segmentName = segment?.name ?? "firma";

  try {
    if (type === "email") {
      const text = await generateEmail(lead, segmentName);
      return NextResponse.json({ text });
    }
    // Regenerate the opportunity brief and persist it on the lead.
    const brief = await briefFromLead(lead, segmentName);
    await prisma.lead.update({
      where: { id },
      data: {
        aiSummary: brief.summary || null,
        aiPainPoint: brief.painPoint || null,
        aiOpportunity: brief.opportunity || null,
      },
    });
    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
