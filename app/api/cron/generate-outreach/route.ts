import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildInitialOutreach } from "@/lib/leads/research/strategist";
import { QUALIFY_AT } from "@/lib/leads/qualification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const results: { campaign: string; generated: number; skippedNoSegment?: boolean }[] = [];

  for (const c of campaigns) {
    if (!c.segmentId) {
      results.push({ campaign: c.name, generated: 0, skippedNoSegment: true });
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

    // Rovnaký text ako Nora (schválená šablóna, buildInitialOutreach) - nie segmentové šablóny.
    let generated = 0;
    for (const lead of leads) {
      const { subject, body } = buildInitialOutreach(lead);
      await prisma.leadEmail.create({
        data: { leadId: lead.id, subject, body, emailType: "initial", status: "draft" },
      });
      generated++;
    }
    results.push({ campaign: c.name, generated });
  }

  return NextResponse.json({ results });
}

export const GET = handle;
export const POST = handle;
