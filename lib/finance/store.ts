import { prisma } from "@/lib/prisma";
import type { FinanceAccount, FinanceTransaction } from "@prisma/client";
import type { AccountType, FinanceAccountDTO, FinanceTransactionDTO, TxType } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function serializeAccount(a: FinanceAccount): FinanceAccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: (a.type === "business" ? "business" : "personal") as AccountType,
    currency: a.currency,
  };
}

export function serializeTx(t: FinanceTransaction & { account?: { name: string } | null }): FinanceTransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    date: t.date.toISOString(),
    amount: t.amount.toNumber(),
    description: t.description,
    category: t.category,
    subcategory: t.subcategory,
    type: (["income", "expense", "transfer"].includes(t.type) ? t.type : "expense") as TxType,
    source: t.source,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Returns a default account, creating "Osobný účet" the first time. Used by voice
 * entry and manual add when the caller didn't pick an account.
 */
export async function getOrCreateDefaultAccount(): Promise<FinanceAccount> {
  const existing = await prisma.financeAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.financeAccount.create({ data: { name: "Osobný účet", type: "personal" } });
}
