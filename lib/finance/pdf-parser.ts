// Parser for SLSP George account statement PDFs ("Výpis z Účtu").
//
// Unlike the CSV export, these aren't a real table in the PDF's internal
// structure — each transaction is a multi-line text block:
//
//   03.03.202603.03.2026 Okamžitá platba (elektronicky)
//   SK48 7500 0000 0040 0706 3459 BIC: CEKOSKBX
//   Názov protiúčtu: Filip Hupka
//   - 50,00
//
// The two date columns ("Dátum valuty" / "Dátum zúčtovania") run together
// with no separator when the text layer is extracted, so a block always
// STARTS with two concatenated DD.MM.YYYY dates + the transaction type
// label, and ENDS with a line that is just the amount (Slovak decimal
// comma, optional leading "- "). Everything in between is detail lines
// (IBAN/BIC, "Názov protiúčtu: X", VS/KS, free-text notes, or — for card
// payments — the merchant + timestamp, which can itself wrap across two
// lines). Reconstructed empirically against a real March 2026 statement.
//
// Reuses the ParsedTx shape from csv-parser.ts so the rest of the import
// pipeline (categorize → resolveCategoryId → dedupe → insert) is identical
// for both sources.

import { parseAmount } from "./csv-parser";
import type { ParsedTx } from "./csv-parser";

const HEADER_RE = /^(\d{2}\.\d{2}\.\d{4})(\d{2}\.\d{2}\.\d{4})\s+(.+)$/;
const AMOUNT_RE = /^-?\s?[\d\s]+,\d{2}$/;
// Trailing "DD. MM. YYYY HH:MM:SS" that George appends to card-merchant lines.
const TRAILING_TIMESTAMP_RE = /\d{2}\.\s?\d{2}\.\s?\d{4}\s+\d{2}:\d{2}:\d{2}\s*$/;
const CURRENCY_LINE_RE = /^\d+[.,]\d+[A-Z]{3}$/; // e.g. "100,86USD"

function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseSlspPdfStatement(text: string): ParsedTx[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: ParsedTx[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i].match(HEADER_RE);
    if (!header) {
      i++;
      continue;
    }
    // Zúčtovania (settlement) dátum — druhý z dvojice — je bližšie reálnemu
    // dátumu spracovania transakcie.
    const date = parseDMY(header[2]);
    const typeLabel = header[3].trim();
    i++;
    if (!date) continue;

    const detailLines: string[] = [];
    let amount: number | null = null;
    while (i < lines.length) {
      if (AMOUNT_RE.test(lines[i])) {
        amount = parseAmount(lines[i]);
        i++;
        break;
      }
      if (HEADER_RE.test(lines[i])) break; // suma chýba — blok zahodíme
      detailLines.push(lines[i]);
      i++;
    }
    if (amount === null || amount === 0) continue;

    const block = detailLines.join("\n");
    const partnerMatch = block.match(/Názov protiúčtu:\s*(.+)/);
    let description: string;
    if (partnerMatch) {
      description = partnerMatch[1].trim();
    } else if (/^Platba kartou/i.test(typeLabel)) {
      const merchantLines = detailLines.filter(
        (l) => !/^Č\. k\./.test(l) && !CURRENCY_LINE_RE.test(l) && !/^Výmenný kurz/i.test(l),
      );
      const merchantText = merchantLines.join(" ").replace(TRAILING_TIMESTAMP_RE, "").trim();
      description = merchantText || typeLabel;
    } else {
      description = typeLabel;
    }

    const rawText = [typeLabel, ...detailLines].join(" ");
    out.push({ date, amount, currency: "EUR", description, rawText });
  }
  return out;
}
