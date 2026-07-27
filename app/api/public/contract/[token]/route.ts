import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VEREJNÉ — klient si pozrie a podpíše zmluvu cez unikátny token.

/** GET /api/public/contract/[token] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const c = await prisma.contract.findUnique({
    where: { token },
    include: {
      project: { include: { client: { select: { company: true } } } },
    },
  });
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    project: { name: c.project.name, company: c.project.client.company },
    content: c.content,
    status: c.status,
    signedAt: c.signedAt ? c.signedAt.toISOString() : null,
    signedByName: c.signedByName,
  });
}

/** POST /api/public/contract/[token] — podpis (meno). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const c = await prisma.contract.findUnique({
    where: { token },
    select: { id: true, signedAt: true, projectId: true },
  });
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.signedAt)
    return NextResponse.json({ error: "already_signed" }, { status: 409 });

  let b: { name?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  if (name.length < 3)
    return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown";
  await prisma.contract.update({
    where: { token },
    data: {
      signedAt: new Date(),
      signedByName: name.slice(0, 200),
      signedByIp: ip,
      status: "signed",
    },
  });
  return NextResponse.json({ ok: true });
}
