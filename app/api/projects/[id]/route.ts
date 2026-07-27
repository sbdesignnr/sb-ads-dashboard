import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProjectSummary } from "@/lib/onboarding/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = [
  "discovery",
  "proposal",
  "contract",
  "onboarding",
  "design",
  "development",
  "review",
  "launch",
  "completed",
];

/** GET /api/projects/[id] — kompletný prehľad projektu. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const summary = await getProjectSummary(id);
  if (!summary)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ summary });
}

/** PATCH /api/projects/[id] — zmena statusu, ceny, dátumov, poznámok, platieb. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Prisma.ProjectUpdateInput = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.status === "string" && STATUSES.includes(b.status))
    data.status = b.status;
  if (typeof b.notes === "string") data.notes = b.notes.trim() || null;
  if (typeof b.depositPaid === "boolean") data.depositPaid = b.depositPaid;
  if (typeof b.finalPaid === "boolean") data.finalPaid = b.finalPaid;

  if ("price" in b) {
    const n = b.price === null || b.price === "" ? null : Number(b.price);
    data.price = n != null && Number.isFinite(n) && n >= 0 ? n : null;
  }
  if ("depositAmount" in b) {
    const n =
      b.depositAmount === null || b.depositAmount === ""
        ? null
        : Number(b.depositAmount);
    data.depositAmount = n != null && Number.isFinite(n) && n >= 0 ? n : null;
  }
  for (const f of ["startDate", "deadline", "launchDate"] as const) {
    if (f in b) {
      if (b[f] === null || b[f] === "") data[f] = null;
      else {
        const d = new Date(b[f] as string);
        if (Number.isNaN(d.getTime()))
          return NextResponse.json({ error: `invalid_${f}` }, { status: 400 });
        data[f] = d;
      }
    }
  }

  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    await prisma.project.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const summary = await getProjectSummary(id);
  return NextResponse.json({ summary });
}
