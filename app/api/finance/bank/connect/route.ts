import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createConnectUrl } from "@/lib/salt-edge/connect";
import { isSaltEdgeConfigured } from "@/lib/salt-edge/client";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSaltEdgeConfigured()) return NextResponse.json({ error: "salt_edge_not_configured" }, { status: 400 });

  // Súhlas na sťahovanie dát žiadame až odo dňa po poslednej transakcii na
  // podnikateľskom účte — zabráni to prekryvu s už ručne naimportovanými
  // (overenými) PDF výpismi.
  const budgetAccount = await prisma.financeAccount.findFirst({ where: { isBudgetAccount: true } });
  const lastTx = budgetAccount
    ? await prisma.financeTransaction.findFirst({
        where: { accountId: budgetAccount.id },
        orderBy: { date: "desc" },
        select: { date: true },
      })
    : null;
  const fromDate = lastTx
    ? new Date(lastTx.date.getTime() + 86_400_000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const returnTo = `${appUrl}/api/finance/bank/callback`;

  try {
    const url = await createConnectUrl(returnTo, fromDate);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Salt Edge connect error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
