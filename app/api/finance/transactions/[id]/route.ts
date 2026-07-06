import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTx } from "@/lib/finance/store";

export const dynamic = "force-dynamic";

// Edit a transaction (e.g. re-categorise from the table).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.category === "string" && body.category.trim()) data.category = body.category.trim();
  if (["income", "expense", "transfer"].includes(String(body.type))) data.type = body.type;
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim();
  if (typeof body.notes === "string") data.notes = body.notes;
  if (body.amount != null && Number.isFinite(Number(body.amount))) data.amount = Number(body.amount);

  try {
    const tx = await prisma.financeTransaction.update({
      where: { id },
      data,
      include: { account: { select: { name: true } } },
    });
    return NextResponse.json({ transaction: serializeTx(tx) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.financeTransaction.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
