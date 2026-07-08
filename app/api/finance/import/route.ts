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

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * SLSP George may export UTF-8, UTF-8+BOM, UTF-16 LE/BE, or Windows-1250.
 * Reading everything as UTF-8 (file.text()) mangles Slovak diacritics from the
 * non-UTF-8 files. We detect by BOM, then fall back to *strict* UTF-8: only if
 * the bytes are NOT valid UTF-8 do we treat them as Windows-1250 — otherwise a
 * genuine UTF-8 file (the common case) would be corrupted into mojibake.
 */
function decodeCsv(buffer: ArrayBuffer): { text: string; encoding: string } {
  const u8 = new Uint8Array(buffer);

  if (u8[0] === 0xff && u8[1] === 0xfe)
    return { text: stripBom(new TextDecoder("utf-16le").decode(buffer)), encoding: "utf-16le" };
  if (u8[0] === 0xfe && u8[1] === 0xff)
    return { text: stripBom(new TextDecoder("utf-16be").decode(buffer)), encoding: "utf-16be" };
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf)
    return { text: stripBom(new TextDecoder("utf-8").decode(buffer)), encoding: "utf-8-bom" };

  // UTF-16 LE without BOM: ASCII bytes are interleaved with 0x00 ("S\0K\0…").
  const sample = u8.subarray(0, Math.min(u8.length, 400));
  let oddNuls = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0x00) oddNuls++;
  if (sample.length > 8 && oddNuls > sample.length / 4)
    return { text: stripBom(new TextDecoder("utf-16le").decode(buffer)), encoding: "utf-16le-nobom" };

  // Trust valid UTF-8; only drop to Windows-1250 when strict UTF-8 rejects it.
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    try {
      return { text: new TextDecoder("windows-1250").decode(buffer), encoding: "windows-1250" };
    } catch {
      return { text: new TextDecoder("utf-8").decode(buffer), encoding: "utf-8-lossy" };
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  // UI sends the file under the field name "file" (financie/page.tsx → fd.append("file", …)).
  const file = form.get("file") as File | null;
  if (!(file instanceof Blob)) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  console.log("File received:", file.name, file.size, file.type);

  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeCsv(buffer);
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
