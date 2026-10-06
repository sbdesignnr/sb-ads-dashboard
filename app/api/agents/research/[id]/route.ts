import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeNote } from "@/lib/agents/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/research/[id] — celý záznam behu (brief so zdrojmi + mail). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = await prisma.leadResearch.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          companyName: true,
          companyCity: true,
          websiteUrl: true,
          companyEmail: true,
          websiteScore: true,
        },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // skutočný osud prvého mailu (pozri app/api/agents/research/route.ts), nech StatusPill nehovorí
  // "Koncept vytvorený" aj po tom, čo bol mail dávno schválený, odoslaný alebo zamietnutý
  const email = await prisma.leadEmail.findFirst({
    where: { leadId: run.leadId, emailType: "initial" },
    select: { status: true, sentAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ run: { ...run, emailStatus: email?.status ?? null, emailSentAt: email?.sentAt ?? null } });
}

/**
 * DELETE /api/agents/research/[id]?reason=… — zahodí výskum (koncept mailu, ak už vznikol, ostáva).
 * Dôvod zahodenia sa zapíše ako spätná väzba, z ktorej sa agenti učia.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get("reason")?.trim().slice(0, 200);
  if (reason) {
    const run = await prisma.leadResearch.findUnique({ where: { id }, select: { leadId: true, offerName: true, lead: { select: { companyName: true, segment: { select: { name: true } } } } } });
    if (run)
      await writeNote({
        agent: "user",
        kind: "feedback",
        leadId: run.leadId,
        title: `Človek zahodil ponuku pre ${run.lead.companyName} (${run.lead.segment?.name ?? "?"}): ${reason}`,
        body: run.offerName ? `Ponuka: ${run.offerName}` : undefined,
      });
  }
  await prisma.leadResearch.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
