import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseSlspCsv, categorizeTransaction } from "@/lib/finance/csv-parser";
import { getOrCreateDefaultAccount } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const dedupKey = (dateISO: string, amount: number, desc: string) =>
  `${dateISO.slice(0, 10)}|${amount.toFixed(2)}|${desc.slice(0, 50)}`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  // UI sends the file under the field name "file" (financie/page.tsx → fd.append("file", …)).
  const file = form.get("file") as File | null;
  if (!(file instanceof Blob)) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  console.log("File received:", file.name, file.size, file.type);

  const text = await file.text();
  console.log("File text length:", text.length);
  console.log("First 200 chars:", text.substring(0, 200));
  console.log("First line:", text.split("\n")[0]);

  let accountId = (form.get("account_id") as string) || "";
  if (!accountId) accountId = (await getOrCreateDefaultAccount()).id;
  else {
    const acc = await prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!acc) accountId = (await getOrCreateDefaultAccount()).id;
  }

  let parsed: ReturnType<typeof parseSlspCsv>;
  try {
    parsed = parseSlspCsv(text);
    console.log("Parse result:", parsed.length);
  } catch (err) {
    console.error("Parse error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
  if (!parsed.length) return NextResponse.json({ imported: 0, skipped: 0 });

  // Build a de-dupe set from existing rows in the imported date range.
  const dates = parsed.map((p) => p.date.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates) + 86_400_000);
  const existing = await prisma.financeTransaction.findMany({
    where: { accountId, date: { gte: min, lt: max } },
    select: { date: true, amount: true, description: true },
  });
  const seen = new Set(existing.map((e) => dedupKey(e.date.toISOString(), e.amount.toNumber(), e.description)));

  const toCreate: {
    accountId: string;
    date: Date;
    amount: number;
    description: string;
    category: string;
    type: string;
    source: string;
  }[] = [];
  let skipped = 0;
  for (const p of parsed) {
    const key = dedupKey(p.date.toISOString(), p.amount, p.description);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const { category, type } = categorizeTransaction(p.rawText || p.description, p.amount);
    toCreate.push({
      accountId,
      date: p.date,
      amount: p.amount,
      description: p.description,
      category,
      type,
      source: "csv_import",
    });
  }

  if (toCreate.length) await prisma.financeTransaction.createMany({ data: toCreate });
  return NextResponse.json({ imported: toCreate.length, skipped });
}
