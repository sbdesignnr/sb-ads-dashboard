// Import leadov z CSV/TSV exportu TrustedLeads.io.
// Čistá logika (bez DB) — parsovanie, mapovanie stĺpcov a určenie segmentu.
// DB zápis rieši app/api/leads/import-csv/route.ts.

/** Zistí oddeľovač: TrustedLeads export je tab-separated, ale ak by prišiel
 *  klasický CSV (čiarky), zvládneme aj to. Rozhodujeme podľa hlavičky. */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  return firstLine.includes("\t") ? "\t" : ",";
}

/** Parser odolný voči úvodzovkám: pole v úvodzovkách môže obsahovať oddeľovač
 *  aj nový riadok, "" je escapovaná úvodzovka. */
export function parseDelimited(text: string): string[][] {
  const delim = detectDelimiter(text);
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Zahoď úplne prázdne riadky (napr. trailing newline).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Normalizovaný lead pripravený na uloženie (bez segmentu — ten sa dopĺňa v route). */
export interface ParsedLead {
  companyName: string;
  companyEmail: string | null;
  companyPhone: string | null;
  websiteUrl: string;
  ownerName: string | null;
  ownerPosition: string | null;
  companyCity: string | null;
  stateRaw: string | null; // "Company State" / "State" z CSV
  country: string | null;
  industry: string;
}

/** Normalizuje web na tvar `https://host/path` (bez koncového „/"), aby dedup
 *  podľa websiteUrl sedel s existujúcimi leadmi. Vráti null ak to nie je web. */
export function normalizeUrl(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u = v;
  if (!/^https?:\/\//i.test(u)) {
    // Holá doména (napr. „firma.sk") — doplníme protokol. Ak to nevyzerá ako
    // doména (žiadna bodka alebo obsahuje medzeru), nie je to web.
    if (!v.includes(".") || /\s/.test(v)) return null;
    u = "https://" + v;
  }
  try {
    const url = new URL(u);
    const out = `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`;
    return (
      out.replace(/\/+$/, "") || `${url.protocol}//${url.host.toLowerCase()}`
    );
  } catch {
    return null;
  }
}

/** Case-insensitive prístup k stĺpcu podľa názvu z hlavičky. */
function makeGetter(header: string[], cells: string[]) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    idx[h.trim().toLowerCase()] = i;
  });
  return (name: string): string => {
    const i = idx[name.trim().toLowerCase()];
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };
}

const clean = (v: string): string | null => (v.trim() ? v.trim() : null);

/** Zmapuje jeden dátový riadok na ParsedLead, alebo null ak sa má preskočiť
 *  (chýba názov firmy alebo web). */
export function mapRow(header: string[], cells: string[]): ParsedLead | null {
  const get = makeGetter(header, cells);

  const companyName = get("Company Name").trim();
  if (!companyName) return null; // (a) bez názvu firmy preskočíme

  const websiteUrl = normalizeUrl(get("Website"));
  if (!websiteUrl) return null; // (b) bez webu nevieme analyzovať

  const ownerName =
    [get("First Name"), get("Last Name")].filter(Boolean).join(" ").trim() ||
    null;

  const email = get("Email").toLowerCase();

  return {
    companyName,
    companyEmail: /.+@.+\..+/.test(email) ? email : null,
    companyPhone: clean(get("Company Phone")),
    websiteUrl,
    ownerName,
    ownerPosition: clean(get("Title")),
    companyCity: clean(get("Company City")) ?? clean(get("City")),
    stateRaw: clean(get("Company State")) ?? clean(get("State")),
    country: clean(get("Company Country")) ?? clean(get("Country")),
    industry: get("Industry"),
  };
}

/** Rozparsuje celý CSV/TSV obsah na zoznam ParsedLead (preskočené riadky vypadnú). */
export function parseTrustedLeadsCsv(text: string): ParsedLead[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const out: ParsedLead[] = [];
  for (let i = 1; i < rows.length; i++) {
    const lead = mapRow(header, rows[i]);
    if (lead) out.push(lead);
  }
  return out;
}

// ── Určenie segmentu podľa Industry ─────────────────────────────────────────
// Vráti kandidátske názvy segmentov v poradí priority. names[0] je „kanonický"
// názov, ktorý sa vytvorí, ak žiadny kandidát v DB neexistuje.

const SEGMENT_RULES: { keys: string[]; names: string[] }[] = [
  {
    keys: ["real estate"],
    names: ["Realitné kancelárie SK+CZ", "Realitné kancelárie"],
  },
  { keys: ["legal", "law"], names: ["Advokáti SK+CZ"] },
  { keys: ["accounting", "finance"], names: ["Účtovníci SK+CZ"] },
  { keys: ["construction", "building"], names: ["Stavebné firmy SK+CZ"] },
  {
    keys: ["health", "medical", "physiotherapy"],
    names: ["Fyzioterapeuti SK+CZ"],
  },
  { keys: ["architecture", "design"], names: ["Architekti SK+CZ"] },
  { keys: ["restaurant", "food", "hospitality"], names: ["Reštaurácie SK+CZ"] },
  { keys: ["hotel", "accommodation"], names: ["Hotelierstvo SK+CZ"] },
  { keys: ["fitness", "sport", "gym"], names: ["Fitness štúdiá SK+CZ"] },
];

export const OTHER_SEGMENT_NAME = "Ostatné";

/** Kandidátske názvy segmentu pre daný Industry (name[0] = na vytvorenie). */
export function resolveSegmentNames(
  industry: string | null | undefined,
): string[] {
  const s = (industry ?? "").toLowerCase();
  for (const rule of SEGMENT_RULES) {
    if (rule.keys.some((k) => s.includes(k))) return rule.names;
  }
  return [OTHER_SEGMENT_NAME];
}
