import { prisma } from "@/lib/prisma";
import { round2, serializeTx } from "./store";
import type { CurrentOverview, FinanceSummary, MonthlyTotal } from "./types";

// Bankou potvrdený "Počiatočný stav Účtu" z prvého importovaného výpisu
// (č. 1/2026, 01.01.2026 - 31.01.2026) pre podnikateľský účet SK75 0900
// 0000 0052 3100 0588. Odvtedy máme v DB súvislý, k centu overený reťazec
// transakcií (každý mesačný výpis reconciled proti "Vklady/Výbery/Konečný
// stav Účtu"), takže kotva + súčet všetkých transakcií = skutočný bankový
// zostatok ku dátumu poslednej zaznamenanej transakcie.
const BUDGET_ACCOUNT_OPENING_BALANCE = 609.15;
const BUDGET_ACCOUNT_OPENING_DATE = "2026-01-01";

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function accountWhere(account: string) {
  return account && account !== "all" ? { accountId: account } : {};
}

/** Income/expense/category/day breakdown for a month, plus last-month totals. */
export async function getFinanceSummary(month: string, account = "all"): Promise<FinanceSummary> {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  const acc = accountWhere(account);

  const [txs, prevTxs] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: { ...acc, date: { gte: start, lt: end } },
      include: { account: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.financeTransaction.findMany({
      where: { ...acc, date: { gte: prevStart, lt: start } },
      select: { amount: true },
    }),
  ]);

  let totalIncome = 0;
  let totalExpenses = 0;
  const catMap = new Map<string, { amount: number; count: number }>();
  const dayMap = new Map<string, { income: number; expenses: number }>();

  for (const t of txs) {
    const a = t.amount.toNumber();
    if (a >= 0) totalIncome += a;
    else totalExpenses += -a;

    if (a < 0) {
      const c = catMap.get(t.category) ?? { amount: 0, count: 0 };
      c.amount += -a;
      c.count += 1;
      catMap.set(t.category, c);
    }
    const dk = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, "0")}-${String(t.date.getUTCDate()).padStart(2, "0")}`;
    const dd = dayMap.get(dk) ?? { income: 0, expenses: 0 };
    if (a >= 0) dd.income += a;
    else dd.expenses += -a;
    dayMap.set(dk, dd);
  }

  const byCategory = [...catMap.entries()]
    .map(([category, v]) => ({ category, amount: round2(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);
  const byDay = [...dayMap.entries()]
    .map(([date, v]) => ({ date, income: round2(v.income), expenses: round2(v.expenses) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const topTransactions = [...txs]
    .sort((a, b) => Math.abs(b.amount.toNumber()) - Math.abs(a.amount.toNumber()))
    .slice(0, 5)
    .map(serializeTx);

  let pIncome = 0;
  let pExpenses = 0;
  for (const t of prevTxs) {
    const a = t.amount.toNumber();
    if (a >= 0) pIncome += a;
    else pExpenses += -a;
  }

  return {
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    balance: round2(totalIncome - totalExpenses),
    byCategory,
    byDay,
    topTransactions,
    vsLastMonth: { income: round2(pIncome), expenses: round2(pExpenses) },
  };
}

/**
 * "Ku dnešku" prehľad, nezávislý od vybraného mesiaca vo filtri — vždy
 * odpovedá na "koľko mám teraz a čo sa hýbe tento mesiac doteraz", nie
 * "čo bolo v tom mesiaci, čo som si vybral". Zámerne viazaný len na
 * podnikateľský (isBudgetAccount) účet, rovnako ako vrecká — kotva
 * zostatku je overená len pre tento jeden účet.
 */
export async function getCurrentOverview(): Promise<CurrentOverview | null> {
  const budgetAccount = await prisma.financeAccount.findFirst({ where: { isBudgetAccount: true } });
  if (!budgetAccount) return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [allTxs, monthTxs, latestTx] = await Promise.all([
    prisma.financeTransaction.findMany({ where: { accountId: budgetAccount.id }, select: { amount: true } }),
    prisma.financeTransaction.findMany({ where: { accountId: budgetAccount.id, date: { gte: monthStart } }, select: { amount: true } }),
    prisma.financeTransaction.findFirst({ where: { accountId: budgetAccount.id }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);

  let movementSum = 0;
  for (const t of allTxs) movementSum += t.amount.toNumber();

  let mtdIncome = 0;
  let mtdExpenses = 0;
  for (const t of monthTxs) {
    const a = t.amount.toNumber();
    if (a >= 0) mtdIncome += a;
    else mtdExpenses += -a;
  }

  return {
    accountName: budgetAccount.name,
    balance: round2(BUDGET_ACCOUNT_OPENING_BALANCE + movementSum),
    balanceAsOfDate: latestTx?.date.toISOString().slice(0, 10) ?? BUDGET_ACCOUNT_OPENING_DATE,
    monthToDateIncome: round2(mtdIncome),
    monthToDateExpenses: round2(mtdExpenses),
    latestMonthWithData: latestTx
      ? `${latestTx.date.getUTCFullYear()}-${String(latestTx.date.getUTCMonth() + 1).padStart(2, "0")}`
      : monthKey(now),
  };
}

/** Income vs expenses for the last N months (for the bar chart). */
export async function getMonthlyTotals(months = 6, account = "all"): Promise<MonthlyTotal[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const txs = await prisma.financeTransaction.findMany({
    where: { ...accountWhere(account), date: { gte: start } },
    select: { amount: true, date: true },
  });

  const map = new Map<string, { income: number; expenses: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1));
    map.set(monthKey(d), { income: 0, expenses: 0 });
  }
  for (const t of txs) {
    const e = map.get(monthKey(t.date));
    if (!e) continue;
    const a = t.amount.toNumber();
    if (a >= 0) e.income += a;
    else e.expenses += -a;
  }
  return [...map.entries()].map(([month, v]) => ({ month, income: round2(v.income), expenses: round2(v.expenses) }));
}
