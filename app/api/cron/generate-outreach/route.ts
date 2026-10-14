import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fillTemplate } from "@/lib/leads/templates";
import { QUALIFY_AT } from "@/lib/leads/qualification";
import { greetableOwnerName } from "@/lib/leads/owner-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mapovanie segmentu kampane -> šablóna, keď segment nemá vlastnú (reuse
// šablóny z rovnakej branže). Bez záznamu tu sa použije šablóna s presne
// týmto segmentId, inak sa segment preskočí (radšej nič, než zlý text).
const SEGMENT_TEMPLATE_OVERRIDES: Record<string, string> = {
  cmr2dld2r00007c5noez4xkyu: "cmrukpzpu0000l904isvyi0d6", // Realitné kancelárie -> šablóna "Realitné kancelárie SK+CZ"
  cmrc0pzx80000n0je2i1dxvpw: "cms32p95q0000l704r88wpvj7", // Stavebné firmy SK+CZ -> šablóna "Stavebné firmy"
  cmr2dldd100027c5nwzm8lx6c: "cms32p95q0000l704r88wpvj7", // Stavebné spoločnosti -> šablóna "Stavebné firmy"
  cmr2dle2c00077c5n0oykmjof: "cmv6k17rg00018o46j2stse81", // Fyzioterapeuti -> šablóna "Fyzioterapeuti"
  cmrc0q1fe0004n0jewu1jc62z: "cmv6k17rg00018o46j2stse81", // Fyzioterapeuti SK+CZ -> šablóna "Fyzioterapeuti"
};

// Cron (Bearer CRON_SECRET) alebo prihlásený používateľ (manuálne tlačidlo).
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const campaigns = await prisma.leadCampaign.findMany({ where: { isActive: true } });
  const results: { campaign: string; generated: number; skippedNoTemplate?: boolean }[] = [];

  for (const c of campaigns) {
    if (!c.segmentId) {
      results.push({ campaign: c.name, generated: 0, skippedNoTemplate: true });
      continue;
    }

    const templateId = SEGMENT_TEMPLATE_OVERRIDES[c.segmentId] ?? c.segmentId;
    const template = await prisma.emailTemplate.findFirst({
      where: SEGMENT_TEMPLATE_OVERRIDES[c.segmentId]
        ? { id: templateId }
        : { segmentId: c.segmentId },
    });
    if (!template) {
      results.push({ campaign: c.name, generated: 0, skippedNoTemplate: true });
      continue;
    }

    // Rovnaký filter ako manuálne "Generovať" v /leads: status new, má email,
    // web vyhodnotený ako naozaj zastaraný (skóre >= prah), ešte bez initial mailu.
    const leads = await prisma.lead.findMany({
      where: {
        status: "new",
        segmentId: c.segmentId,
        companyEmail: { not: null },
        NOT: { companyEmail: "" },
        emails: { none: { emailType: "initial" } },
        websiteScore: { gte: QUALIFY_AT },
      },
      orderBy: { websiteScore: "desc" },
    });

    let generated = 0;
    for (const lead of leads) {
      const vars = {
        firma: lead.companyName,
        mesto: lead.companyCity,
        web: lead.websiteUrl,
        konatel: greetableOwnerName(lead),
        kraj: lead.region,
      };
      const subject = fillTemplate(template.subject, vars).trim() || `Návrh pre ${lead.companyName}`;
      const bodyText = fillTemplate(template.body, vars).trim();
      if (!bodyText) continue;
      await prisma.leadEmail.create({
        data: { leadId: lead.id, subject, body: bodyText, emailType: "initial", status: "draft" },
      });
      generated++;
    }
    if (generated > 0) {
      await prisma.emailTemplate
        .update({ where: { id: template.id }, data: { useCount: { increment: generated } } })
        .catch(() => {});
    }
    results.push({ campaign: c.name, generated });
  }

  return NextResponse.json({ results });
}

export const GET = handle;
export const POST = handle;
