// Jednorazová migrácia: zavedie vrecká (Profit First) a FinanceCategory tabuľku,
// namapuje na ne existujúce (free-text) kategórie transakcií a doplní categoryId.
// Idempotentné (upsert) — dá sa spustiť znova bez duplicít.
//
// Run: npx tsx scripts/migrate-finance-categories.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BUCKETS = [
  { name: "Dane a odvody", percentage: 15, color: "#ef4444", sortOrder: 0, isPayBucket: false },
  { name: "Biznis náklady", percentage: 15, color: "#f97316", sortOrder: 1, isPayBucket: false },
  { name: "Rezerva", percentage: 20, color: "#eab308", sortOrder: 2, isPayBucket: false },
  { name: "Výplata", percentage: 40, color: "#22c55e", sortOrder: 3, isPayBucket: true },
  { name: "Investície", percentage: 10, color: "#3b82f6", sortOrder: 4, isPayBucket: false },
];

// Mapovanie reálnych kategórií rule enginu na vrecká. Príjmové kategórie →
// isIncome:true, bucketId: null (vrecká sú o rozdelení príjmu, nie o jeho
// vlastnej kategorizácii). Všetko ostatné → Výplata (najbezpečnejší default,
// dá sa prehodiť v Nastaveniach).
const CATEGORY_BUCKET: Record<string, string | null> = {
  "Zdravotné poistenie": "Dane a odvody",
  "Predplatné": "Biznis náklady",
  "Príjem": null,
  "Príjem z projektu": null,
};
const INCOME_CATEGORIES = new Set(["Príjem", "Príjem z projektu"]);

async function main() {
  // 1) Vrecká
  const bucketIdByName = new Map<string, string>();
  for (const b of BUCKETS) {
    const existing = await prisma.financeBucket.findUnique({ where: { name: b.name } });
    const row = existing
      ? await prisma.financeBucket.update({
          where: { id: existing.id },
          data: { percentage: b.percentage, color: b.color, sortOrder: b.sortOrder, isPayBucket: b.isPayBucket },
        })
      : await prisma.financeBucket.create({ data: b });
    bucketIdByName.set(b.name, row.id);
    console.log(`${existing ? "↻" : "+"} vrecko „${b.name}“ (${b.percentage}%)`);
  }

  // 2) Reálne hodnoty FinanceTransaction.category v DB (zdroj pravdy, nie hádaný zoznam)
  const distinct = await prisma.financeTransaction.groupBy({
    by: ["category"],
    _count: true,
  });
  console.log(`\nNájdených ${distinct.length} odlišných kategórií v DB:`);

  const categoryIdByName = new Map<string, string>();
  let backfilled = 0;
  for (const row of distinct) {
    const name = row.category;
    const isIncome = INCOME_CATEGORIES.has(name);
    const mappedBucketName = name in CATEGORY_BUCKET ? CATEGORY_BUCKET[name] : "Výplata";
    const bucketId = mappedBucketName ? (bucketIdByName.get(mappedBucketName) ?? null) : null;

    const existingCat = await prisma.financeCategory.findUnique({ where: { name } });
    const cat = existingCat
      ? existingCat
      : await prisma.financeCategory.create({
          data: { name, isIncome, bucketId, sortOrder: categoryIdByName.size },
        });
    categoryIdByName.set(name, cat.id);

    const updated = await prisma.financeTransaction.updateMany({
      where: { category: name, categoryId: null },
      data: { categoryId: cat.id },
    });
    backfilled += updated.count;
    const bucketLabel = mappedBucketName ?? "(príjem, bez vrecka)";
    console.log(`  ${existingCat ? "=" : "+"} „${name}“ (${row._count}×) → ${bucketLabel} · doplnených ${updated.count}`);
  }

  console.log(`\nSpolu doplnených categoryId: ${backfilled}`);

  // 3) Podnikateľský účet → isBudgetAccount, ak je presne jeden
  const businessAccounts = await prisma.financeAccount.findMany({ where: { type: "business" } });
  if (businessAccounts.length === 1) {
    await prisma.financeAccount.update({ where: { id: businessAccounts[0].id }, data: { isBudgetAccount: true } });
    console.log(`\nÚčet „${businessAccounts[0].name}“ nastavený ako podnikateľský (isBudgetAccount).`);
  } else {
    console.log(
      `\nPOZOR: nájdených ${businessAccounts.length} podnikateľských účtov (nie presne 1) — nastav isBudgetAccount ručne v /financie/nastavenia.`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
