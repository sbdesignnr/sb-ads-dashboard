import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeClient } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STR_FIELDS = [
  "name",
  "company",
  "email",
  "phone",
  "address",
  "ico",
  "dic",
  "note",
] as const;

/** GET /api/clients/[id] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { _count: { select: { projects: true } } },
  });
  if (!client)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ client: serializeClient(client) });
}

/** PATCH /api/clients/[id] */
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

  const data: Record<string, string | null> = {};
  for (const f of STR_FIELDS) {
    if (typeof b[f] === "string") {
      const v = (b[f] as string).trim();
      // company/name/email nikdy neprázdnime na null — prázdno = ponechať; ostatné null.
      data[f] = v || (["company", "name", "email"].includes(f) ? "" : null);
      if (data[f] === "" && ["company", "name", "email"].includes(f))
        delete data[f];
    }
  }
  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const client = await prisma.client.update({
      where: { id },
      data,
      include: { _count: { select: { projects: true } } },
    });
    return NextResponse.json({ client: serializeClient(client) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/** DELETE /api/clients/[id] — zmaže klienta aj jeho projekty (cascade). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
