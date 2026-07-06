// Parser for SLSP George transaction CSV exports (semicolon-separated, quoted).
// Header: "Dátum";"Suma";"Mena";"Zostatok";"Názov protistrany";"IBAN protistrany";
//         "Konštantný symbol";"Variabilný symbol";"Špecifický symbol";"Referencia";
//         "Poznámka";"Typ"

export interface ParsedTx {
  date: Date;
  amount: number; // + income, - expense
  currency: string;
  description: string; // clean, for display
  rawText: string; // combined text used for categorisation
}

function fold(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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

function parseAmount(raw: string): number {
  let s = raw.replace(/[\s ]/g, ""); // strip spaces (thousands separators)
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

/** Parse a full SLSP George CSV export into transactions. */
export function parseSlspCsv(csvContent: string): ParsedTx[] {
  const lines = csvContent
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedTx[] = [];
  for (const line of lines) {
    // Skip the header row.
    if (/d[áa]tum/i.test(line) && /suma/i.test(line)) continue;
    const f = parseCsvLine(line);
    if (f.length < 3) continue;

    const date = parseDate(f[0]);
    if (!date) continue; // not a data row
    const amount = parseAmount(f[1]);
    const currency = (f[2] || "EUR").toUpperCase();
    const counterparty = f[4] ?? "";
    const note = f[10] ?? "";
    const type = f[11] ?? "";

    const description = [counterparty, note].filter(Boolean).join(" · ") || note || type || "Transakcia";
    const rawText = [counterparty, note, type, f[9] ?? ""].filter(Boolean).join(" ");

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
