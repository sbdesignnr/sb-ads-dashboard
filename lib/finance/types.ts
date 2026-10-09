export type TxType = "income" | "expense" | "transfer";
export type AccountType = "personal" | "business";

export interface FinanceAccountDTO {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  isBudgetAccount: boolean;
}

export interface FinanceCategoryDTO {
  id: string;
  name: string;
  bucketId: string | null;
  isIncome: boolean;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface FinanceBucketDTO {
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

export interface SafeToSpendDTO {
  payBucketName: string | null;
  medianIncome: number;
  safeToSpend: number;
  requestedWindowMonths: number;
  effectiveWindowMonths: number;
}

export interface BucketOverviewDTO {
  budgetAccountId: string | null;
  budgetAccountName: string | null;
  buckets: FinanceBucketDTO[];
  unassigned: { count: number; amount: number };
  safeToSpend: SafeToSpendDTO;
}

export interface FinanceTransactionDTO {
  id: string;
  accountId: string;
  accountName: string | null;
  date: string; // ISO
  amount: number; // + income, - expense
  description: string;
  category: string;
  subcategory: string | null;
  type: TxType;
  source: string;
  notes: string | null;
  createdAt: string;
}

export interface CategorySum {
  category: string;
  amount: number; // positive (expense magnitude)
  count: number;
}

export interface DaySum {
  date: string; // yyyy-mm-dd
  income: number;
  expenses: number;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  byCategory: CategorySum[];
  byDay: DaySum[];
  topTransactions: FinanceTransactionDTO[];
  vsLastMonth: { income: number; expenses: number };
}

export interface MonthlyTotal {
  month: string; // yyyy-mm
  income: number;
  expenses: number;
}

// A palette for category donut slices (stable by index).
export const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#0ea5e9",
];
