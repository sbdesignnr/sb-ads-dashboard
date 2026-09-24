import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCzLead } from "@/lib/leads/scanner";
import { verifyOwner } from "@/lib/leads/owner-verification";
import { QUALIFY_AT } from "@/lib/leads/qualification";
import { fixMojibake } from "@/lib/leads/text-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Registre (ORSR/ARES) sú pomalé a nepatria nám — držíme malú dávku a nízku
// súbežnosť. Klient volá dokola, kým `remaining` > 0.
const BATCH = 8;
const CONCURRENCY = 2;
// Neúspešné overenie sa po tomto čase skúsi znova (register sa mení).
const RECHECK_MS = 14 * 24 * 3600 * 1000;

/**
 * Kvalifikované leady s e-mailom, ktorým ešte nevieme OVERENÉ meno konateľa
 * (ownerSource null) a ktoré sme v poslednom čase neskúšali.
 */
function pendingWhere(segmentId?: string): Prisma.LeadWhereInput {
  return {
    status: "new",
    websiteScore: { gte: QUALIFY_AT },
    companyEmail: { not: null },
    NOT: { companyEmail: "" },
    ownerSource: null,
    OR: [
      { ownerCheckedAt: null },
      { ownerCheckedAt: { lt: new Date(Date.now() - RECHECK_MS) } },
    ],
    ...(segmentId ? { segmentId } : {}),
  };
}

function scopeOf(req: NextRequest, bodySegment?: string): string | undefined {
  const seg = bodySegment ?? req.nextUrl.searchParams.get("segment");
  return seg && seg !== "all" ? seg : undefined;
}

/** GET — koľko kvalifikovaných leadov má overené meno / čaká na overenie. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const segmentId = scopeOf(req);
  const base: Prisma.LeadWhereInput = {
    status: "new",
    websiteScore: { gte: QUALIFY_AT },
    companyEmail: { not: null },
    NOT: { companyEmail: "" },
    ...(segmentId ? { segmentId } : {}),
  };
  const [total, verified, pending] = await Promise.all([
    prisma.lead.count({ where: base }),
    prisma.lead.count({ where: { ...base, ownerSource: { not: null } } }),
    prisma.lead.count({ where: pendingWhere(segmentId) }),
  ]);
  return NextResponse.json({ total, verified, pending, unverified: total - verified });
}

/** POST — overí ďalšiu dávku (register → meno konateľa). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* celý rozsah */
  }
  const segmentId = scopeOf(req, body.segmentId);

  const leads = await prisma.lead.findMany({
    where: pendingWhere(segmentId),
    orderBy: [{ ownerCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: BATCH,
  });

  let verified = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < leads.length) {
      const lead = leads[cursor++];
      try {
        const name = fixMojibake(lead.companyName);
        const owner = lead.ownerName ? fixMojibake(lead.ownerName) : null;
        const city = lead.companyCity ? fixMojibake(lead.companyCity) : null;
        const ver = await verifyOwner({
          companyName: name,
          city,
          ico: lead.ico,
          websiteUrl: lead.websiteUrl,
          cz: isCzLead(lead),
          candidate: { name: owner, position: lead.ownerPosition },
          // Web sa tu nescanuje (drahé) — meno z webu overí až celá analýza.
          siteText: null,
          trustIco: Boolean(lead.ico),
          email: lead.companyEmail,
        });
        const reg = ver.registry;
        const regTrusted = reg && (reg.nameMatches || ver.owner?.source === "registry");
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            ...(name !== lead.companyName ? { companyName: name } : {}),
            ...(owner && owner !== lead.ownerName ? { ownerName: owner } : {}),
            ...(city && city !== lead.companyCity ? { companyCity: city } : {}),
            ...(regTrusted && reg
              ? {
                  ico: reg.ico ?? lead.ico ?? undefined,
                  companyCity: lead.companyCity ?? reg.city ?? undefined,
                  companyAddress: lead.companyAddress ?? reg.address ?? undefined,
                  companyActive: reg.active,
                }
              : {}),
            ...(ver.owner
              ? {
                  ownerName: ver.owner.name,
                  ownerPosition: ver.owner.position ?? lead.ownerPosition ?? undefined,
                  ownerSource: ver.owner.source,
                }
              : {}),
            ownerCheckedAt: new Date(),
          },
        });
        if (ver.owner) verified++;
      } catch {
        // Zlyhanie jedného leadu dávku nezastaví; označíme ho ako skúšaného, nech
        // sa slučka nezacyklí (zopakuje sa po RECHECK_MS).
        await prisma.lead
          .update({ where: { id: lead.id }, data: { ownerCheckedAt: new Date() } })
          .catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const remaining = await prisma.lead.count({ where: pendingWhere(segmentId) });
  return NextResponse.json({ processed: leads.length, verified, remaining });
}
