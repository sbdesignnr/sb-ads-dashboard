import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { categorizeTransaction } from "@/lib/finance/csv-parser";
import { getOrCreateDefaultAccount, serializeTx } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual transaction entry (cash / voice). Body:
// { account_id?, date?, amount, description, category?, subcategory?, type?, source?, notes? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  const description = String(body.description ?? "").trim() || "Transakcia";

  let accountId = typeof body.account_id === "string" && body.account_id ? body.account_id : "";
  if (accountId) {
    const acc = await prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!acc) accountId = "";
  }
  if (!accountId) accountId = (await getOrCreateDefaultAccount()).id;

  const auto = categorizeTransaction(description, amount);
  const category = String(body.category ?? "").trim() || auto.category;
  const type = ["income", "expense", "transfer"].includes(String(body.type)) ? String(body.type) : auto.type;
  const date = body.date ? new Date(String(body.date)) : new Date();

  const tx = await prisma.financeTransaction.create({
    data: {
      accountId,
      date: Number.isNaN(date.getTime()) ? new Date() : date,
      amount,
      description,
      category,
      subcategory: typeof body.subcategory === "string" ? body.subcategory : null,
      type,
      source: typeof body.source === "string" && body.source ? body.source : "manual",
      notes: typeof body.notes === "string" ? body.notes : null,
    },
    include: { account: { select: { name: true } } },
  });
  return NextResponse.json({ transaction: serializeTx(tx) });
}
