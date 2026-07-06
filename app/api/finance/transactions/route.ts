import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTx } from "@/lib/finance/store";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;

  const where: Prisma.FinanceTransactionWhereInput = {};
  const month = sp.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }
  const category = sp.get("category");
  if (category && category !== "all") where.category = category;
  const type = sp.get("type");
  if (type && type !== "all") where.type = type;
  const account = sp.get("account");
  if (account && account !== "all") where.accountId = account;
  const q = sp.get("q")?.trim();
  if (q) where.description = { contains: q, mode: "insensitive" };

  const transactions = await prisma.financeTransaction.findMany({
    where,
    include: { account: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 300,
  });
  return NextResponse.json({ transactions: transactions.map(serializeTx) });
}
