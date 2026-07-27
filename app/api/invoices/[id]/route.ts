import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeInvoice } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/invoices/[id] — `{ status }` (unpaid|paid|overdue). Označenie „paid"
 * doplní dátum platby a pri deposit/final faktúre zapíše aj do projektu.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: { status?: string } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const status = b.status;
  if (!["unpaid", "paid", "overdue"].includes(String(status))) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: status!, paidAt: status === "paid" ? new Date() : null },
  });

  // Zrkadli platbu do projektu (deposit/final).
  if (invoice.type === "deposit") {
    await prisma.project.update({
      where: { id: invoice.projectId },
      data: { depositPaid: status === "paid" },
    });
  } else if (invoice.type === "final") {
    await prisma.project.update({
      where: { id: invoice.projectId },
      data: { finalPaid: status === "paid" },
    });
  }

  return NextResponse.json({ invoice: serializeInvoice(updated) });
}

/** DELETE /api/invoices/[id] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
