import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";
import { isCzLead } from "@/lib/leads/scanner";
import { verifyOwner } from "@/lib/leads/owner-verification";
import { icoChecksumValid } from "@/lib/leads/website-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/leads/[id]/enrich-owner
 *
 * Overí konateľa v obchodnom registri (SK: ORSR, ČR: ARES) BEZ drahého re-scanu
 * webu. Voliteľne prijme `ico` z tela — keď si IČO našiel ručne (napr. na stránke
 * GDPR / obchodných podmienok), zadáš ho a register dohľadá konateľa presne.
 *
 * Meno sa zapíše LEN ak je overené (osoba v štatutárnom orgáne firmy). Bez IČO
 * sa firma hľadá podľa názvu, ale iba pri prísnej zhode názvu a mesta — inak sa
 * nič nezapíše (radšej žiadny konateľ než konateľ inej firmy).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: { ico?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* prázdne telo je v poriadku */
  }

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // IČO: z tela (ručne zadané) má prednosť, inak to, čo už na leade je.
  const typedIco =
    typeof body.ico === "string" ? body.ico.replace(/\D/g, "") : "";
  if (typedIco && (typedIco.length !== 8 || !icoChecksumValid(typedIco))) {
    return NextResponse.json(
      {
        error: "invalid_ico",
        message: "IČO musí mať 8 číslic a platný kontrolný súčet.",
      },
      { status: 400 },
    );
  }
  const ico = typedIco || lead.ico || null;

  const ver = await verifyOwner({
    companyName: lead.companyName,
    city: lead.companyCity,
    ico,
    websiteUrl: lead.websiteUrl,
    cz: isCzLead(lead),
    candidate: { name: lead.ownerName, position: lead.ownerPosition },
    // IČO, ktoré zadal človek, je dôveryhodné aj pri inom obchodnom názve.
    trustIco: Boolean(typedIco || lead.ico),
    email: lead.companyEmail,
  });

  if (!ver.registry) {
    return NextResponse.json(
      {
        error: "not_in_registry",
        message:
          "V registri sa nenašla firma s týmto názvom a mestom. Skús zadať IČO ručne.",
      },
      { status: 404 },
    );
  }

  const reg = ver.registry;
  const regTrusted = reg.nameMatches || ver.owner?.source === "registry";
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...(regTrusted
        ? {
            ico: reg.ico ?? ico ?? undefined,
            companyCity: lead.companyCity ?? reg.city ?? undefined,
            companyAddress: lead.companyAddress ?? reg.address ?? undefined,
            companyActive: reg.active,
          }
        : {}),
      // Ručne potvrdené meno sa neprepisuje.
      ...(ver.owner && lead.ownerSource !== "manual"
        ? {
            ownerName: ver.owner.name,
            ownerPosition: ver.owner.position ?? lead.ownerPosition ?? undefined,
            ownerSource: ver.owner.source,
          }
        : {}),
      ownerCheckedAt: new Date(),
    },
  });

  return NextResponse.json({
    lead: serializeLead(updated),
    found: {
      ownerName: ver.owner?.name ?? null,
      ownerPosition: ver.owner?.position ?? null,
      ico: reg.ico ?? ico,
      matched: !!ver.owner,
      source: ver.owner?.source ?? null,
      registryName: reg.matchedName,
      reason: ver.reason,
    },
  });
}
