import { prisma } from "@/lib/prisma";
import { CATEGORY_COLORS } from "./types";

/**
 * Nájde FinanceCategory podľa mena, alebo ju auto-vytvorí (self-healing — nová
 * kategória z rule enginu alebo z Jarvisu nikdy neskončí bez FK).
 */
export async function resolveCategoryId(name: string, amount: number): Promise<string> {
  const existing = await prisma.financeCategory.findUnique({ where: { name } });
  if (existing) return existing.id;
  const count = await prisma.financeCategory.count();
  const created = await prisma.financeCategory.create({
    data: {
      name,
      isIncome: amount >= 0,
      color: CATEGORY_COLORS[count % CATEGORY_COLORS.length],
      sortOrder: count,
    },
  });
  return created.id;
}

/**
 * Premenuje kategóriu a prepíše denormalizovaný string `category` na všetkých
 * transakciách, ktoré na ňu ukazujú — tie dve hodnoty musia ostať v súlade.
 */
export async function renameCategory(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("empty_name");
  await prisma.$transaction([
    prisma.financeCategory.update({ where: { id }, data: { name: trimmed } }),
    prisma.financeTransaction.updateMany({ where: { categoryId: id }, data: { category: trimmed } }),
  ]);
}
