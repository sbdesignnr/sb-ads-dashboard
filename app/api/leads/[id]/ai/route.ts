import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateEmail, generateDossier } from "@/lib/leads/ai";
import { enrichLead } from "@/lib/leads/scanner";
import { serializeLead } from "@/lib/leads/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const seg = {
      id: segment?.id ?? "",
      name: segment?.name ?? "firma",
      communicationStyle: segment?.communicationStyle ?? null,
    };

    // Web ešte nebol analyzovaný (napr. lead z CSV importu) → najprv kompletný scan
    // (skóre, nedostatky, vizuál). Pri kvalifikovaných weboch pritom vznikne aj AI podklad.
    const needsScan = lead.websiteScore == null;
    if (needsScan) {
      if (!lead.websiteUrl) {
        return NextResponse.json({ error: "Lead nemá web, nie je čo analyzovať." }, { status: 400 });
      }
      await enrichLead(id, seg);
    }

    let current = await prisma.lead.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (current.websiteScore == null) {
      return NextResponse.json({ error: "Analýza webu zlyhala — web sa nepodarilo načítať. Skús to neskôr." }, { status: 502 });
    }

    // enrichLead robí AI podklad (súhrn / pain point / príležitosť) len pre weby so skóre
    // ≥ 65; pri ostatných ho preskočí. Tlačidlo ho má vytvoriť vždy — z už uložených
    // zistení, bez opätovného scanu webu. Čerstvo naskenovaný lead, ktorý podklad už má,
    // nepočítame druhýkrát.
    const hasDossier = Boolean(current.aiSummary || current.aiPainPoint || current.aiOpportunity);
    if (!(needsScan && hasDossier)) {
      const issues = [
        ...(current.websiteIssues ?? []),
        ...(current.visualIssues ?? []).map((v) => `Vizuálne: ${v}`),
        ...(current.aiVisualReason ? [`Vizuálne hodnotenie: ${current.aiVisualReason}`] : []),
      ];
      const dossier = await generateDossier({
        companyName: current.companyName,
        segmentName: seg.name,
        communicationStyle: seg.communicationStyle,
        websiteUrl: current.websiteUrl,
        companyCity: current.companyCity,
        ico: current.ico,
        companyActive: current.companyActive,
        orsrOwnerName: current.ownerName,
        orsrOwnerPosition: current.ownerPosition,
        placesPhone: current.companyPhone,
        extractedEmails: current.companyEmail ? [current.companyEmail] : [],
        websiteScore: current.websiteScore,
        websiteTechnology: current.websiteTechnology,
        websiteAge: current.websiteAge,
        pageSpeedMobile: current.pageSpeedMobile,
        pageSpeedDesktop: current.pageSpeedDesktop,
        hasSsl: current.hasSsl,
        isMobileFriendly: current.isMobileFriendly,
        issues,
        // Text webu sa pri skene neukladá — nech AI nemyslí, že sa web nenačítal.
        pageText: "(Text webu nie je uložený — vychádzaj z technických údajov a zistených nedostatkov vyššie.)",
      });
      if (!dossier.summary && !dossier.painPoint && !dossier.opportunity) {
        return NextResponse.json({ error: "AI nevrátila žiadny výsledok, skús to znova." }, { status: 502 });
      }
      current = await prisma.lead.update({
        where: { id },
        data: {
          aiSummary: dossier.summary || null,
          aiPainPoint: dossier.painPoint || null,
          aiOpportunity: dossier.opportunity || null,
          aiOutreachAngle: dossier.outreachAngle || null,
          bestContactTime: dossier.bestContactTime || null,
        },
      });
    }

    return NextResponse.json({ lead: serializeLead(current) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
