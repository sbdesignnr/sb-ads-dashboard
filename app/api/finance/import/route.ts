import { NextResponse, type NextRequest } from "next/server";
import { PDFParse } from "pdf-parse";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseSlspCsv, decodeCsv, type ParsedTx } from "@/lib/finance/csv-parser";
import { parseSlspPdfStatement } from "@/lib/finance/pdf-parser";
import { categorizeTransaction } from "@/lib/finance/categorize";
import { resolveCategoryId } from "@/lib/finance/categories";
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

/** Rozlíši CSV vs. PDF podľa prípony/MIME typu (nie podľa obsahu — oba vieme s istotou rozlíšiť vopred). */
function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function parseOneFile(file: File): Promise<{ parsed: ParsedTx[]; source: "csv_import" | "pdf_import" }> {
  const bytes = await readBytes(file);
  console.log("Buffer size:", bytes.byteLength, "·", file.name);

  if (isPdf(file)) {
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    const { text } = await parser.getText();
    await parser.destroy();
    const parsed = parseSlspPdfStatement(text);
    console.log("PDF parse result:", parsed.length, "transakcií z", file.name);
    return { parsed, source: "pdf_import" };
  }

  const { text, encoding } = decodeCsv(bytes);
  console.log("Encoding detected:", encoding, "· first 100 chars:", text.substring(0, 100));
  const parsed = parseSlspCsv(text);
  console.log("CSV parse result:", parsed.length, "transakcií z", file.name);
  return { parsed, source: "csv_import" };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Celé telo v jednom try/catch — predtým pokrývalo chyby len parsovanie
  // súborov, takže čokoľvek zlyhalo NESKÔR (dedup dotaz, resolveCategoryId,
  // createMany) spadlo ako neošetrená výnimka → Next vrátil holý HTML/500
  // bez JSON tela, takže klient nevedel ukázať žiadnu zrozumiteľnú správu.
  try {
    const form = await req.formData();
    // UI pošle jeden alebo viac súborov pod rovnakým poľom "file" (viacero mesačných výpisov naraz).
    const files = form.getAll("file").filter((f): f is File => f instanceof Blob);
    if (!files.length) return NextResponse.json({ error: "missing_file" }, { status: 400 });

    let accountId = (form.get("account_id") as string) || "";
    if (!accountId) accountId = (await getOrCreateDefaultAccount()).id;
    else {
      const acc = await prisma.financeAccount.findUnique({ where: { id: accountId } });
      if (!acc) accountId = (await getOrCreateDefaultAccount()).id;
    }

    const parsed: ParsedTx[] = [];
    let source: "csv_import" | "pdf_import" = "csv_import";
    for (const file of files) {
      const r = await parseOneFile(file);
      parsed.push(...r.parsed);
      source = r.source; // pri zmiešanom dávkovom nahraní (nepravdepodobné) vyhrá posledný typ
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
      categoryId: string;
      type: string;
      source: string;
    }[] = [];
    let skipped = 0;
    // Jeden resolveCategoryId() volanie na KAŽDÚ odlišnú kategóriu v dávke, nie na riadok.
    const categoryIdCache = new Map<string, string>();
    for (const p of parsed) {
      const key = dedupKey(p.date.toISOString(), p.amount, p.description);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const { category, type } = categorizeTransaction(p.rawText || p.description, p.amount);
      let categoryId = categoryIdCache.get(category);
      if (!categoryId) {
        categoryId = await resolveCategoryId(category, p.amount);
        categoryIdCache.set(category, categoryId);
      }
      toCreate.push({
        accountId,
        date: p.date,
        amount: p.amount,
        description: p.description,
        category,
        categoryId,
        type,
        source,
      });
    }

    if (toCreate.length) await prisma.financeTransaction.createMany({ data: toCreate });
    return NextResponse.json({ imported: toCreate.length, skipped });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
