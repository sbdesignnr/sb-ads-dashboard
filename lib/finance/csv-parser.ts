// Parser for SLSP George transaction CSV exports (quoted fields).
//
// Real George export is COMMA-separated with every value quoted — and the
// amount uses a Slovak decimal comma ("-17,85"), which lives INSIDE the quotes.
// So the field delimiter and the decimal separator are both ",": the parser
// MUST be quote-aware, otherwise "-17,85" would split into two columns.
//
// Header (first row):
//   "Vlastný názov účtu","Vlastný IBAN","Dátum splatnosti","Suma","Mena",
//   "Partner","IBAN partnera","BIC/SWIFT kód banky partnera",
//   "Číslo účtu partnera","CC kód banky partnera","Popis transakcie",
//   "Typ transakcie","Konštantný symbol","Špecifický symbol","Variabilný symbol"
//
// Columns are matched by header NAME (not position), so a semicolon/tab layout
// or a slightly different order still parses.

export interface ParsedTx {
  date: Date;
  amount: number; // + income, - expense
  currency: string;
  description: string; // clean, for display
  rawText: string; // combined text used for categorisation
}

function fold(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Split one CSV line into fields, honouring "quoted" values and escaped ""
 * quotes. Commas (or whatever `delim` is) INSIDE quotes are kept verbatim, so a
 * decimal comma like "-17,85" survives. Outer quotes are stripped.
 */
function parseCSVLine(line: string, delim = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'; // escaped "" → literal quote
          i++;
        } else {
          inQuotes = false; // closing quote
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Pick a column index by header name — exact match first, then substring. */
function findCol(headers: string[], exact: string[], includes: string[] = []): number {
  const folded = headers.map(fold);
  for (const e of exact) {
    const i = folded.indexOf(fold(e));
    if (i !== -1) return i;
  }
  for (const inc of includes) {
    const needle = fold(inc);
    const i = folded.findIndex((h) => h.includes(needle));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Detect the field delimiter from the header line. We can't just count
 * characters (decimal commas hide inside quotes), so we quote-aware parse the
 * line with each candidate and keep whichever yields a "Suma" column + the most
 * fields.
 */
function detectDelim(headerLine: string): "," | ";" | "\t" {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  let best: "," | ";" | "\t" = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const cols = parseCSVLine(headerLine, d);
    const score = (cols.some((c) => /suma/i.test(c)) ? 1000 : 0) + cols.length;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function parseAmount(raw: string): number {
  // Strip spaces incl. non-breaking (U+00A0) used as thousands separators.
  let s = raw.replace(/[\s ]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // "1.234,56" → dot = thousands, comma = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Slovak format: "-17,85" → "-17.85"
    s = s.replace(",", ".");
  }
  s = s.replace(/[^0-9.\-+]/g, "");
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseDate(raw: string): Date | null {
  const m = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  // Store as UTC midnight so the calendar day never drifts across timezones.
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a full SLSP George CSV export into transactions. */
export function parseSlspCsv(csvContent: string): ParsedTx[] {
  const lines = csvContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (!lines.length) {
    console.log("Row count:", 0);
    return [];
  }

  // Headers are in the first row — no skipping.
  const delim = detectDelim(lines[0]);
  const delimName = delim === "," ? "comma" : delim === ";" ? "semicolon" : "tab";
  console.log("Delimiter detected:", delimName);

  const headers = parseCSVLine(lines[0], delim);
  const rows = lines
    .slice(1)
    .map((l) => parseCSVLine(l, delim))
    .filter((r) => r.some((c) => c.trim() !== ""));

  console.log("Headers:", headers);
  console.log("Row count:", rows.length);
  console.log("Sample row:", rows[0]);

  const idxDate = findCol(headers, ["datum splatnosti"], ["datum"]);
  const idxAmount = findCol(headers, ["suma"], ["suma"]);
  const idxCurrency = findCol(headers, ["mena"], ["mena"]);
  const idxPartner = findCol(headers, ["partner", "nazov protistrany"]); // exact — avoid "IBAN partnera" etc.
  const idxPopis = findCol(headers, ["popis transakcie", "poznamka"], ["popis"]);
  const idxType = findCol(headers, ["typ transakcie", "typ"], ["typ"]);

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");

  const out: ParsedTx[] = [];
  for (const r of rows) {
    // Skip rows where Suma is empty or 0.
    const amountRaw = cell(r, idxAmount);
    if (!amountRaw.trim()) continue;
    const amount = parseAmount(amountRaw);
    if (amount === 0) continue;

    const date = parseDate(cell(r, idxDate));
    if (!date) continue; // not a data row

    const currency = (cell(r, idxCurrency) || "EUR").toUpperCase();
    const partner = cell(r, idxPartner);
    const popis = cell(r, idxPopis); // "note"
    const type = cell(r, idxType);

    // description ← Partner (fallback Typ transakcie); note (Popis) appended.
    const primary = partner || type || "Transakcia";
    const description = popis && popis !== primary ? `${primary} · ${popis}` : primary;
    const rawText = [partner, popis, type].filter(Boolean).join(" ");

    out.push({ date, amount, currency, description, rawText });
  }
  return out;
}

const RULES: { category: string; keywords: string[] }[] = [
  { category: "Potraviny", keywords: ["BILLA", "TESCO", "LIDL", "KAUFLAND", "COOP"] },
  { category: "Jedlo & reštaurácie", keywords: ["REŠTAURÁCIA", "PIZZ", "BURGER", "CAFE", "KAVIAREŇ", "BISTRO", "KEBAB"] },
  { category: "Predplatné", keywords: ["CLAUDE", "VERCEL", "SUPABASE", "OPENAI", "ELEVEN", "BREVO", "GOOGLE", "ANTHROPIC"] },
  { category: "Doprava", keywords: ["SHELL", "OMV", "MOL", "BENZÍN", "NAFTA", "PARKOVN"] },
  { category: "Zdravie", keywords: ["LEKÁR", "LEKÁREŇ", "DOKTOR", "NEMOCNICA"] },
  { category: "Oblečenie", keywords: ["ADIDAS", "NIKE", "ZARA", "HM", "MALL", "ALZA"] },
  { category: "Zábava & šport", keywords: ["FUTBAL", "GYM", "FITNESS", "SPORT"] },
];

export function categorizeTransaction(
  description: string,
  amount: number,
): { category: string; type: "income" | "expense" } {
  const d = fold(description);
  for (const r of RULES) {
    if (r.keywords.some((k) => d.includes(fold(k)))) {
      return { category: r.category, type: amount >= 0 ? "income" : "expense" };
    }
  }
  if (amount > 0 && (d.includes("PLATBA") || d.includes("PREVOD PRIJATY"))) {
    return { category: "Príjem z projektu", type: "income" };
  }
  return { category: amount >= 0 ? "Príjem" : "Ostatné", type: amount >= 0 ? "income" : "expense" };
}
