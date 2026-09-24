import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { QUALIFY_AT, EMAIL_PIPELINE_SINCE } from "@/lib/leads/qualification";
import { isLegacyDraft } from "@/lib/leads/draft-state";
import { generateOutreachEmail, EmailQualityError, getAiUsage, resetAiUsage } from "@/lib/leads/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Každý mail = písanie + jazyková korektúra (+ prípadné opakovanie), preto malá dávka.
const BATCH = 5;

/** Neupravené staré koncepty pre VHODNÉ leady (ostatné rieši cleanup). */
async function legacyDrafts(segmentId?: string) {
  const where: Prisma.LeadEmailWhereInput = {
    emailType: "initial",
    status: "draft",
    updatedAt: { lt: new Date(EMAIL_PIPELINE_SINCE) },
    lead: {
      status: "new",
      websiteScore: { gte: QUALIFY_AT },
      ...(segmentId ? { segmentId } : {}),
    },
  };
  const rows = await prisma.leadEmail.findMany({
    where,
    include: { lead: { include: { segment: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.filter((e) => isLegacyDraft(e));
}

function scope(req: NextRequest, bodySeg?: string): string | undefined {
  const seg = bodySeg ?? req.nextUrl.searchParams.get("segment");
  return seg && seg !== "all" ? seg : undefined;
}

/** GET — koľko starých konceptov pre vhodné leady čaká na prepísanie. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await legacyDrafts(scope(req));
  return NextResponse.json({ remaining: list.length });
}

/**
 * POST — prepíše ďalšiu dávku starých konceptov novým generátorom (overené meno,
 * kontrola kvality, korektúra). Koncept, ktorý sa nepodarí (nesplní kontrolu alebo
 * je segment nevhodný), sa zmaže, aby v rade nezostal starý mail s neoverenými
 * údajmi — "Načítať emaily" ho neskôr vytvorí znova.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* všetky segmenty */
  }
  const segmentId = scope(req, body.segmentId);

  resetAiUsage();
  const batch = (await legacyDrafts(segmentId)).slice(0, BATCH);
  let regenerated = 0;
  let removed = 0;
  const problems: string[] = [];
  await Promise.all(
    batch.map(async (e) => {
      try {
        const out = await generateOutreachEmail({
          lead: e.lead,
          segmentName: e.lead.segment?.name ?? "firma",
          type: "initial",
        });
        if (out.skipReason || !out.subject || !out.body) {
          await prisma.leadEmail.delete({ where: { id: e.id } });
          removed++;
          problems.push(`${e.lead.companyName}: preskočený (${out.skipReason ?? "prázdny mail"})`);
          return;
        }
        // createdAt = teraz: prepísaný koncept nie je "starý" ani "ručne upravený".
        await prisma.leadEmail.update({
          where: { id: e.id },
          data: { subject: out.subject, body: out.body, createdAt: new Date() },
        });
        regenerated++;
      } catch (err) {
        if (err instanceof EmailQualityError) {
          await prisma.leadEmail.delete({ where: { id: e.id } }).catch(() => {});
          removed++;
          problems.push(`${e.lead.companyName}: nespĺňa kontrolu kvality (${err.issues[0] ?? "?"})`);
        } else {
          // Chyba siete/AI — koncept ostáva, zopakuje sa pri ďalšom kliknutí.
          problems.push(`${e.lead.companyName}: chyba (${(err as Error).message.slice(0, 80)})`);
        }
      }
    }),
  );

  const remaining = (await legacyDrafts(segmentId)).length;
  return NextResponse.json({
    processed: batch.length,
    regenerated,
    removed,
    remaining,
    problems: problems.slice(0, 20),
    usage: getAiUsage(),
  });
}
