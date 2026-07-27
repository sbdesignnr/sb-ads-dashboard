import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeInvoice } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["deposit", "final", "other"];

/**
 * POST /api/projects/[id]/invoice — vygeneruje faktúru. `type` = deposit | final | other.
 * Pri deposit/final sa suma dopočíta z ceny projektu, ak nie je zadaná (deposit = 30 %,
 * final = zvyšok). Splatnosť predvolene o 14 dní.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: { type?: string; amount?: number | string; dueDate?: string } = {};
  try {
    b = await req.json();
  } catch {
    /* prázdne telo je v poriadku — predvolí sa deposit */
  }
  const type = TYPES.includes(String(b.type)) ? String(b.type) : "deposit";

  const project = await prisma.project.findUnique({
    where: { id },
    select: { price: true, depositAmount: true },
  });
  if (!project)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const price = project.price?.toNumber() ?? 0;
  const deposit =
    project.depositAmount?.toNumber() ?? Math.round(price * 0.3 * 100) / 100;

  let amount = b.amount != null && b.amount !== "" ? Number(b.amount) : NaN;
  if (!Number.isFinite(amount)) {
    amount =
      type === "deposit"
        ? deposit
        : type === "final"
          ? Math.round((price - deposit) * 100) / 100
          : 0;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const dueDate = b.dueDate
    ? new Date(b.dueDate)
    : new Date(Date.now() + 14 * 86_400_000);
  if (Number.isNaN(dueDate.getTime()))
    return NextResponse.json({ error: "invalid_dueDate" }, { status: 400 });

  const invoice = await prisma.invoice.create({
    data: { projectId: id, type, amount, dueDate },
  });
  return NextResponse.json(
    { invoice: serializeInvoice(invoice) },
    { status: 201 },
  );
}
