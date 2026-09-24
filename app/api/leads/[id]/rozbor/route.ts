import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateRozbor, EmailQualityError } from "@/lib/leads/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/leads/[id]/rozbor
 *
 * Pripraví rozbor webu (3 konkrétne veci), ktorý cold e-mail sľúbil — na odpoveď leadu,
 * ktorý povedal "áno". Robí sa z už uložených zistení (bez nového skenu), stojí ≈ 2 centy.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  const { id } = await ctx.params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { segment: true, emails: { where: { emailType: "initial" }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(lead.visualIssues?.length || lead.websiteIssues?.length)) {
    return NextResponse.json(
      { error: "Lead nemá uložené zistenia z analýzy webu - najprv v Príležitosti (AI) klikni Analyzovať." },
      { status: 422 },
    );
  }

  try {
    const { body } = await generateRozbor({
      lead,
      segmentName: lead.segment?.name ?? "firma",
    });
    const initialSubject = lead.emails[0]?.subject;
    const subject = initialSubject
      ? `Re: ${initialSubject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}`
      : "Rozbor webu";
    return NextResponse.json({ subject, body, to: lead.companyEmail });
  } catch (e) {
    if (e instanceof EmailQualityError)
      return NextResponse.json(
        { error: `Rozbor nesplnil kontrolu kvality (${e.issues[0] ?? "?"}). Skús znova.` },
        { status: 422 },
      );
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
