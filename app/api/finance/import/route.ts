import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseSlspCsv, categorizeTransaction, decodeCsv } from "@/lib/finance/csv-parser";
import { getOrCreateDefaultAccount } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const dedupKey = (dateISO: string, amount: number, desc: string) =>
  `${dateISO.slice(0, 10)}|${amount.toFixed(2)}|${desc.slice(0, 50)}`;

/**
 * Read the raw bytes of an uploaded file, robust across runtimes. Some Vercel
 * builds have returned empty/garbled ArrayBuffers for binary (UTF-16) uploads,
 * so we try Blob.bytes() first, then arrayBuffer(), then drain the stream —
 * all server-side APIs (no browser-only FileReader). We never fall back to
 * file.text(): that decodes as UTF-8 and would destroy UTF-16/Windows-1250
 * bytes before decodeCsv can detect the real encoding.
 */
async function readBytes(file: Blob): Promise<Uint8Array> {
  const withBytes = file as Blob & { bytes?: () => Promise<Uint8Array> };
  if (typeof withBytes.bytes === "function") {
    const b = await withBytes.bytes();
    if (b.byteLength > 0) return b;
  }

  const ab = await file.arrayBuffer();
  if (ab.byteLength > 0) return new Uint8Array(ab);

  // Last resort: concatenate the stream chunks.
  const chunks: Uint8Array[] = [];
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  // UI sends the file under the field name "file" (financie/page.tsx → fd.append("file", …)).
  const file = form.get("file") as File | null;
  if (!(file instanceof Blob)) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  console.log("File received:", file.name, file.size, file.type);

  const bytes = await readBytes(file);
  console.log("Buffer size:", bytes.byteLength);
  console.log(
    "First 4 bytes:",
    Array.from(bytes.subarray(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join(" "),
  );

  const { text, encoding } = decodeCsv(bytes);
  console.log("Encoding detected:", encoding, "· first 100 chars:", text.substring(0, 100));
  console.log("First line clean:", text.split("\n")[0]);
  console.log("File text length:", text.length);

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
