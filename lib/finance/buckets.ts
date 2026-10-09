import { prisma } from "@/lib/prisma";
import { round2 } from "./store";

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface BucketOverviewItem {
  id: string;
  name: string;
  percentage: number;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isPayBucket: boolean;
  allocated: number;
  spent: number;
  balance: number;
}

export interface SafeToSpend {
  payBucketName: string | null;
  medianIncome: number;
  safeToSpend: number;
  requestedWindowMonths: number;
  effectiveWindowMonths: number;
}

export interface BucketOverview {
  budgetAccount: { id: string; name: string } | null;
  buckets: BucketOverviewItem[];
  unassigned: { count: number; amount: number };
  safeToSpend: SafeToSpend;
}

const emptySafeToSpend = (windowMonths: number): SafeToSpend => ({
  payBucketName: null,
  medianIncome: 0,
  safeToSpend: 0,
  requestedWindowMonths: windowMonths,
  effectiveWindowMonths: 0,
});

/**
 * Vrecká (Profit First štýl) + "bezpečné na minutie" — počíta sa LEN z účtu
 * s isBudgetAccount:true (podnikateľský príjem), nie zo všetkých účtov.
 */
export async function getBucketOverview(windowMonths = 6): Promise<BucketOverview> {
  const budgetAccount = await prisma.financeAccount.findFirst({
    where: { isBudgetAccount: true },
    select: { id: true, name: true },
  });

  const buckets = await prisma.financeBucket.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (!budgetAccount) {
    return {
      budgetAccount: null,
      buckets: buckets.map((b) => ({
        id: b.id,
        name: b.name,
        percentage: b.percentage.toNumber(),
        color: b.color,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
        isPayBucket: b.isPayBucket,
        allocated: 0,
        spent: 0,
        balance: 0,
      })),
      unassigned: { count: 0, amount: 0 },
      safeToSpend: emptySafeToSpend(windowMonths),
    };
  }

  const categories = await prisma.financeCategory.findMany({
    select: { id: true, bucketId: true },
  });
  const categoryBucket = new Map(categories.map((c) => [c.id, c.bucketId]));

  const [incomeAgg, expenseGroups, earliest] = await Promise.all([
    prisma.financeTransaction.aggregate({
      where: { accountId: budgetAccount.id, type: "income" },
      _sum: { amount: true },
    }),
    prisma.financeTransaction.groupBy({
      by: ["categoryId"],
      where: { accountId: budgetAccount.id, type: "expense" },
      _sum: { amount: true },
    }),
    prisma.financeTransaction.findFirst({
      where: { accountId: budgetAccount.id },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  const totalIncome = incomeAgg._sum.amount?.toNumber() ?? 0;

  const spentByBucket = new Map<string, number>();
  let unassignedAmount = 0;
  let unassignedCount = 0;
  for (const g of expenseGroups) {
    const amount = Math.abs(g._sum.amount?.toNumber() ?? 0);
    const bucketId = g.categoryId ? categoryBucket.get(g.categoryId) : undefined;
    if (!bucketId) {
      unassignedAmount += amount;
      unassignedCount += 1;
      continue;
    }
    spentByBucket.set(bucketId, (spentByBucket.get(bucketId) ?? 0) + amount);
  }

  const overview: BucketOverviewItem[] = buckets.map((b) => {
    const pct = b.percentage.toNumber();
    const allocated = round2((totalIncome * pct) / 100);
    const spent = round2(spentByBucket.get(b.id) ?? 0);
    return {
      id: b.id,
      name: b.name,
      percentage: pct,
      color: b.color,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      isPayBucket: b.isPayBucket,
      allocated,
      spent,
      balance: round2(allocated - spent),
    };
  });

  // "Bezpečné na minutie" — medián mesačného príjmu za okno, nezarovnávať
  // nulami mesiace pred prvou transakciou na účte.
  const payBucket = buckets.find((b) => b.isPayBucket) ?? null;
  let safeToSpend = emptySafeToSpend(windowMonths);
  if (payBucket && earliest) {
    const now = new Date();
    const requestedStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (windowMonths - 1), 1));
    const earliestMonthStart = new Date(Date.UTC(earliest.date.getUTCFullYear(), earliest.date.getUTCMonth(), 1));
    const windowStart = requestedStart > earliestMonthStart ? requestedStart : earliestMonthStart;

    const effectiveWindowMonths =
      (now.getUTCFullYear() - windowStart.getUTCFullYear()) * 12 + (now.getUTCMonth() - windowStart.getUTCMonth()) + 1;

    const incomeTxs = await prisma.financeTransaction.findMany({
      where: { accountId: budgetAccount.id, type: "income", date: { gte: windowStart } },
      select: { amount: true, date: true },
    });

    const monthly = new Map<string, number>();
    for (let i = 0; i < effectiveWindowMonths; i++) {
      const d = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1));
      monthly.set(monthKey(d), 0);
    }
    for (const t of incomeTxs) {
      const k = monthKey(t.date);
      if (monthly.has(k)) monthly.set(k, (monthly.get(k) ?? 0) + t.amount.toNumber());
    }

    const medianIncome = median([...monthly.values()]);
    const pct = payBucket.percentage.toNumber();
    safeToSpend = {
      payBucketName: payBucket.name,
      medianIncome: round2(medianIncome),
      safeToSpend: round2((medianIncome * pct) / 100),
      requestedWindowMonths: windowMonths,
      effectiveWindowMonths,
    };
  } else if (payBucket) {
    safeToSpend = { ...emptySafeToSpend(windowMonths), payBucketName: payBucket.name };
  }

  return {
    budgetAccount,
    buckets: overview,
    unassigned: { count: unassignedCount, amount: round2(unassignedAmount) },
    safeToSpend,
  };
}
