import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enableBankingRequest } from "./client";
import { categorizeTransaction } from "@/lib/finance/categorize";
import { resolveCategoryId } from "@/lib/finance/categories";

interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  status?: string; // BOOK | PDNG | ...
  credit_debit_indicator?: "CRDT" | "DBIT";
  transaction_amount: { amount: string; currency: string };
  remittance_information?: string[] | null;
  note?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function fetchTransactions(accountUid: string, dateFrom: string): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let key: string | undefined;
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom, transaction_status: "BOOK", ...(key ? { continuation_key: key } : {}) });
    const res = await enableBankingRequest<{ transactions: EbTransaction[]; continuation_key?: string | null }>(
      `/accounts/${encodeURIComponent(accountUid)}/transactions?${qs}`,
    );
    out.push(...res.transactions);
    if (!res.continuation_key) break;
    key = res.continuation_key;
  }
  return out;
}

function describe(t: EbTransaction, amount: number): string {
  const remittance = (t.remittance_information ?? []).join(" ").trim();
  const counterparty = (amount < 0 ? t.creditor?.name : t.debtor?.name)?.trim() ?? "";
  const text = [counterparty, remittance || t.note?.trim() || ""].filter(Boolean).join(" - ");
  return text || "Transakcia";
}

/**
 * Synchronizuje jedno bankové pripojenie: pre každý lokálne napojený účet stiahne zaúčtované
 * transakcie. Dedup ide cez `externalId` (createMany so skipDuplicates). Prvý sync začína
 * deň po poslednej existujúcej transakcii (neprekrýva sa s ručne importovanými PDF výpismi),
 * ďalšie berú posledné 3 dni späť, aby sa nestratila oneskorene zaúčtovaná položka.
 */
export async function syncBankConnection(bankConnectionId: string): Promise<{ imported: number; accounts: number }> {
  const connection = await prisma.bankConnection.findUnique({
    where: { id: bankConnectionId },
    include: { accounts: true },
  });
  if (!connection) throw new Error("Bank connection not found");
  if (connection.validUntil && connection.validUntil < new Date()) {
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: "inactive" } });
    throw new Error("Súhlas banky vypršal, prepoj účet znova v Nastaveniach financií.");
  }

  let imported = 0;
  for (const account of connection.accounts) {
    if (!account.externalAccountId) continue;

    const lastSynced = await prisma.financeTransaction.findFirst({
      where: { accountId: account.id, source: "bank_sync" },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const lastAny = lastSynced
      ? null
      : await prisma.financeTransaction.findFirst({ where: { accountId: account.id }, orderBy: { date: "desc" }, select: { date: true } });
    const from = lastSynced
      ? new Date(lastSynced.date.getTime() - 3 * DAY)
      : lastAny
        ? new Date(lastAny.date.getTime() + DAY)
        : new Date(Date.now() - 30 * DAY);

    const transactions = await fetchTransactions(account.externalAccountId, isoDay(from));

    const categoryIdCache = new Map<string, string>();
    const seen = new Map<string, number>(); // poradie rovnakých položiek v rámci dňa (fallback id)
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
      if (t.status && t.status !== "BOOK") continue;
      const day = t.booking_date ?? t.value_date ?? t.transaction_date;
      if (!day) continue;
      const abs = Math.abs(Number(t.transaction_amount.amount));
      const amount = t.credit_debit_indicator === "DBIT" ? -abs : abs;
      if (!Number.isFinite(amount)) continue;
      const description = describe(t, amount);

      let ref = t.entry_reference || t.transaction_id || "";
      if (!ref) {
        const base = createHash("sha1").update(`${day}|${amount}|${description}`).digest("hex").slice(0, 20);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        ref = `h-${base}-${n}`;
      }

      const { category, type } = categorizeTransaction(description, amount);
      let categoryId = categoryIdCache.get(category);
      if (!categoryId) {
        categoryId = await resolveCategoryId(category, amount);
        categoryIdCache.set(category, categoryId);
      }
      toCreate.push({
        accountId: account.id,
        date: new Date(`${day}T00:00:00.000Z`),
        amount,
        description,
        category,
        categoryId,
        type,
        source: "bank_sync",
        // lokálne id účtu, nie uid z banky: to sa mení s každým novým pripojením a spôsobilo by duplicity
        externalId: `eb:${account.id}:${ref}`,
      });
    }

    if (toCreate.length) {
      const res = await prisma.financeTransaction.createMany({ data: toCreate, skipDuplicates: true });
      imported += res.count;
    }
    // Skutočný zostatok z banky (CLBD = zaúčtovaný koncový zostatok, inak ITBD)
    let balanceData: { bankBalance: number; bankBalanceAt: Date } | null = null;
    try {
      const b = await enableBankingRequest<{ balances: { balance_type: string; balance_amount: { amount: string } }[] }>(
        `/accounts/${encodeURIComponent(account.externalAccountId)}/balances`,
      );
      const pick = b.balances.find((x) => x.balance_type === "CLBD") ?? b.balances.find((x) => x.balance_type === "ITBD");
      const amount = pick ? Number(pick.balance_amount.amount) : NaN;
      if (Number.isFinite(amount)) balanceData = { bankBalance: amount, bankBalanceAt: new Date() };
    } catch (e) {
      console.error("[bank-sync] balance fetch failed:", (e as Error).message);
    }
    await prisma.financeAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), ...(balanceData ?? {}) } });
  }

  await prisma.bankConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });
  return { imported, accounts: connection.accounts.length };
}
