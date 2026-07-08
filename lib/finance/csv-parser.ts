// Parser for SLSP George transaction CSV/TSV exports (quoted fields).
//
// Real George export header (";" or "\t" separated, values in quotes):
//   "Vlastný názov účtu";"Vlastný IBAN";"Dátum splatnosti";"Suma";"Mena";
//   "Partner";"IBAN partnera";"BIC/SWIFT kód banky partnera";
//   "Číslo účtu partnera";"CC kód banky partnera";"Popis transakcie";
//   "Typ transakcie";"Konštantný symbol";"Špecifický symbol";"Variabilný symbol"
//
// Columns are matched by header NAME (not position), so an older layout
// ("Dátum";"Suma";"Mena";"Zostatok";"Názov protistrany"…) still parses.

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

/** Split one CSV line, honouring "quoted" fields and escaped "" quotes. */
function parseCsvLine(line: string, delim = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
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

function parseAmount(raw: string): number {
  // Strip spaces incl. non-breaking (U+00A0) used as thousands separators.
  let s = raw.replace(/[\s ]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // "1.234,56" → dot = thousands, comma = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
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

/** Detect the field separator from the header line (";" vs tab). */
function detectDelim(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  return tab > semi ? "\t" : ";";
}

/** Parse a full SLSP George CSV/TSV export into transactions. */
export function parseSlspCsv(csvContent: string): ParsedTx[] {
  const lines = csvContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  // Skip any leading noise (filename / metadata) — the real header is the
  // first line that contains a "Suma" column.
  let headerIdx = -1;
  let delim = ";";
  for (let i = 0; i < lines.length; i++) {
    if (/suma/i.test(lines[i])) {
      headerIdx = i;
      delim = detectDelim(lines[i]);
      break;
    }
  }

  if (headerIdx === -1) {
    console.log("CSV rows found:", 0);
    console.log("Headers:", "(none — no 'Suma' column detected)");
    return [];
  }

  const headers = parseCsvLine(lines[headerIdx], delim);
  const rows = lines
    .slice(headerIdx + 1)
    .map((l) => parseCsvLine(l, delim))
    .filter((r) => r.some((c) => c.trim() !== ""));

  console.log("CSV rows found:", rows.length);
  console.log("First row:", rows[0]);
  console.log("Headers:", headers);

  const idxDate = findCol(headers, ["datum splatnosti"], ["datum"]);
  const idxAmount = findCol(headers, ["suma"], ["suma"]);
  const idxCurrency = findCol(headers, ["mena"], ["mena"]);
  const idxPartner = findCol(headers, ["partner", "nazov protistrany"]); // exact only — avoid "IBAN partnera" etc.
  const idxPopis = findCol(headers, ["popis transakcie", "poznamka"], ["popis"]);
  const idxType = findCol(headers, ["typ transakcie", "typ"], ["typ"]);

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");

  const out: ParsedTx[] = [];
  for (const r of rows) {
    // 4. Skip rows where Suma is empty or 0.
    const amountRaw = cell(r, idxAmount);
    if (!amountRaw.trim()) continue;
    const amount = parseAmount(amountRaw);
    if (amount === 0) continue;

    const date = parseDate(cell(r, idxDate));
    if (!date) continue; // not a data row

    const currency = (cell(r, idxCurrency) || "EUR").toUpperCase();
    const partner = cell(r, idxPartner);
    const popis = cell(r, idxPopis);
    const type = cell(r, idxType);

    // Description: Partner + Popis transakcie.
    const description =
      [partner, popis].filter(Boolean).join(" · ") || partner || popis || type || "Transakcia";
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
