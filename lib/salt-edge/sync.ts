import { prisma } from "@/lib/prisma";
import { saltEdgeRequest } from "./client";
import { categorizeTransaction } from "@/lib/finance/categorize";
import { resolveCategoryId } from "@/lib/finance/categories";

interface SaltEdgeAccount {
  id: string;
  connection_id: string;
  name: string;
  nature: string;
  balance: number;
  currency_code: string;
}

interface SaltEdgeTransaction {
  id: string;
  account_id: string;
  duplicated: boolean;
  status: "posted" | "pending";
  made_on: string; // YYYY-MM-DD
  amount: number;
  currency_code: string;
  description: string;
  category: string;
}

async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let fromId: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({ ...params, per_page: "500", ...(fromId ? { from_id: fromId } : {}) });
    const res = await saltEdgeRequest<{ data: T[]; meta?: { next_id?: string } }>(`${path}?${qs}`);
    out.push(...res.data);
    if (!res.meta?.next_id) break;
    fromId = res.meta.next_id;
  }
  return out;
}

/**
 * Synchronizuje jedno bankové pripojenie: pokúsi sa o refresh (best effort —
 * ak banka ešte nestihla dáta pripraviť, chýbajúce sa doplnia pri ďalšom behu
 * crona), potom stiahne účty a transakcie pre každý lokálne napojený FinanceAccount.
 * Dedup ide cez `externalId` (unikátne Salt Edge id transakcie) — createMany
 * so skipDuplicates, žiadny vlastný compound kľúč, žiadne riziko kolízie
 * v rámci jednej dávky.
 */
export async function syncBankConnection(bankConnectionId: string): Promise<{ imported: number; accounts: number }> {
  const connection = await prisma.bankConnection.findUnique({
    where: { id: bankConnectionId },
    include: { accounts: true },
  });
  if (!connection) throw new Error("Bank connection not found");

  try {
    await saltEdgeRequest(`/connections/${connection.connectionId}/refresh`, { method: "POST" });
  } catch {
    // Refresh môže zlyhať (napr. "too soon since last refresh") — nevadí,
    // pokračujeme na čítanie toho, čo už Salt Edge má.
  }

  const seAccounts = await fetchAllPages<SaltEdgeAccount>("/accounts", { connection_id: connection.connectionId });

  let imported = 0;
  for (const localAccount of connection.accounts) {
    if (!localAccount.externalAccountId) continue;
    const match = seAccounts.find((a) => a.id === localAccount.externalAccountId);
    if (!match) continue;

    const transactions = await fetchAllPages<SaltEdgeTransaction>("/transactions", {
      connection_id: connection.connectionId,
      account_id: match.id,
    });

    const categoryIdCache = new Map<string, string>();
    const toCreate: {
      accountId: string;
      date: Date;
      amount: number;
      description: string;
      category: string;
      categoryId: string;
      type: string;
      source: string;
      externalId: string;
    }[] = [];

    for (const t of transactions) {
      // "pending" transakcie môžu pri vysporiadaní zmeniť id/sumu — importujeme
      // len "posted", rovnaký princíp ako pri PDF importe (len uzavreté položky).
      if (t.status !== "posted") continue;
      const { category, type } = categorizeTransaction(t.description, t.amount);
      let categoryId = categoryIdCache.get(category);
      if (!categoryId) {
        categoryId = await resolveCategoryId(category, t.amount);
        categoryIdCache.set(category, categoryId);
      }
      toCreate.push({
        accountId: localAccount.id,
        date: new Date(`${t.made_on}T00:00:00.000Z`),
        amount: t.amount,
        description: t.description,
        category,
        categoryId,
        type,
        source: "salt_edge_sync",
        externalId: t.id,
      });
    }

    if (toCreate.length) {
      const res = await prisma.financeTransaction.createMany({ data: toCreate, skipDuplicates: true });
      imported += res.count;
    }
    await prisma.financeAccount.update({ where: { id: localAccount.id }, data: { lastSyncedAt: new Date() } });
  }

  await prisma.bankConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
  return { imported, accounts: connection.accounts.length };
}
