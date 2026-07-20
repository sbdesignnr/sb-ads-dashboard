import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead } from "@/lib/leads/store";
import { isCzLead } from "@/lib/leads/scanner";
import { enrichCompany } from "@/lib/leads/orsr";
import { enrichCompanyAres } from "@/lib/leads/ares";
import { icoChecksumValid } from "@/lib/leads/website-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/leads/[id]/enrich-owner
 *
 * Dotiahne konateľa + IČO + mesto z obchodného registra (SK: ORSR, ČR: ARES) BEZ
 * drahého re-scanu webu. Voliteľne prijme `ico` z tela — keď si IČO našiel ručne
 * (napr. na stránke GDPR / obchodných podmienok), zadáš ho a register dohľadá
 * konateľa presne. Bez IČO sa skúsi zhoda podľa názvu firmy.
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

  const registry = isCzLead(lead)
    ? await enrichCompanyAres({ ico, name: lead.companyName }).catch(() => null)
    : await enrichCompany({ ico, name: lead.companyName }).catch(() => null);

  if (!registry) {
    return NextResponse.json(
      {
        error: "not_in_registry",
        message: "V registri sa nenašla zhoda. Skús zadať IČO ručne.",
      },
      { status: 404 },
    );
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ico: registry.ico ?? ico ?? undefined,
      // Registrový konateľ prepíše prázdno; existujúce meno prepíše iba ak register nejaké má.
      ownerName: registry.ownerName ?? lead.ownerName ?? undefined,
      ownerPosition: registry.ownerPosition ?? lead.ownerPosition ?? undefined,
      companyCity: lead.companyCity ?? registry.city ?? undefined,
      companyAddress: lead.companyAddress ?? registry.address ?? undefined,
      companyActive: registry.active,
    },
  });

  return NextResponse.json({
    lead: serializeLead(updated),
    found: {
      ownerName: registry.ownerName,
      ownerPosition: registry.ownerPosition,
      ico: registry.ico ?? ico,
      matched: !!registry.ownerName,
    },
  });
}
