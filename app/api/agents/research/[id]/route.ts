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
    select: { id: true, status: true, sentAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    run: { ...run, emailId: email?.id ?? null, emailStatus: email?.status ?? null, emailSentAt: email?.sentAt ?? null },
  });
}

/**
 * DELETE /api/agents/research/[id]?reason=… — zahodí výskum. Dôvod sa zapíše ako spätná väzba
 * pre agentov. Lead sa zároveň označí ako odmietnutý (rovnaký status, aký používa aj automatické
 * vyradenie Mirom/Norou), inak by bola jediná poistka proti opätovnému návrhu práve zmazaný
 * záznam výskumu — a Skaut by tú istú firmu v ďalšom kole pokojne vybral znova. Prípadný
 * nevybavený koncept pre ňu sa zároveň zamietne, nech nezostane v tichosti visieť vo fronte.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get("reason")?.trim().slice(0, 200);
  const run = await prisma.leadResearch.findUnique({
    where: { id },
    select: { leadId: true, offerName: true, lead: { select: { companyName: true, segment: { select: { name: true } } } } },
  });
  if (run) {
    if (reason) {
      await writeNote({
        agent: "user",
        kind: "feedback",
        leadId: run.leadId,
        title: `Človek zahodil ponuku pre ${run.lead.companyName} (${run.lead.segment?.name ?? "?"}): ${reason}`,
        body: run.offerName ? `Ponuka: ${run.offerName}` : undefined,
      });
    }
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: run.leadId },
        data: {
          status: "rejected",
          disqualifyReason: `Zahodené v pracovni Nory${reason ? `: ${reason}` : ""}`.slice(0, 300),
        },
      }),
      prisma.leadEmail.updateMany({
        where: { leadId: run.leadId, status: { in: ["draft", "approved"] } },
        data: { status: "rejected" },
      }),
    ]);
  }
  await prisma.leadResearch.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
