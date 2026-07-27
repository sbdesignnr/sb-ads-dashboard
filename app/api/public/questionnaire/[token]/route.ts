import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeQuestionnaire } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VEREJNÉ (bez prihlásenia) — klient vypĺňa dotazník cez unikátny token.

/** GET /api/public/questionnaire/[token] — načíta dotazník na predvyplnenie. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const q = await prisma.questionnaire.findUnique({
    where: { token },
    include: {
      project: { include: { client: { select: { company: true } } } },
    },
  });
  if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    project: { name: q.project.name, company: q.project.client.company },
    completed: Boolean(q.completedAt),
    questionnaire: serializeQuestionnaire(q),
  });
}

// Povolené polia + ich typ (str | strArr | bool | color).
const STR = [
  "businessDescription",
  "idealCustomer",
  "uniqueValue",
  "websiteGoal",
  "hasPhotos",
  "hasTexts",
  "cmsNeeded",
  "specialRequirements",
  "bookingNeeded",
  "bookingCurrentProcess",
  "budget",
  "deadline",
  "additionalInfo",
  "maintenanceInterest",
  "seoInterest",
  "adsInterest",
  "monthlyAdsBudget",
] as const;
const STR_ARR = [
  "brandWords",
  "inspirationUrls",
  "antiInspirationUrls",
  "requiredSections",
  "specialFeatures",
  "languages",
  "externalIntegrations",
] as const;
const COLOR = ["primaryColor", "secondaryColor"] as const;

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null;
}
function cleanArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
}
function cleanColor(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim())
    ? v.trim()
    : null;
}

/** POST /api/public/questionnaire/[token] — uloží odpovede a označí ako vyplnené. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const existing = await prisma.questionnaire.findUnique({
    where: { token },
    select: { id: true },
  });
  if (!existing)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Prisma.QuestionnaireUpdateInput = {};
  for (const f of STR)
    if (f in b) (data as Record<string, unknown>)[f] = cleanStr(b[f]);
  for (const f of STR_ARR)
    if (f in b) (data as Record<string, unknown>)[f] = cleanArr(b[f]);
  for (const f of COLOR)
    if (f in b) (data as Record<string, unknown>)[f] = cleanColor(b[f]);
  if ("hasLogo" in b)
    data.hasLogo = typeof b.hasLogo === "boolean" ? b.hasLogo : null;

  // Finálne odoslanie označí dotazník ako vyplnený.
  if (b.submit === true) data.completedAt = new Date();

  await prisma.questionnaire.update({ where: { token }, data });
  return NextResponse.json({ ok: true, submitted: b.submit === true });
}
