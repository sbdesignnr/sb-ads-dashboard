import * as cheerio from "cheerio";

// ORSR.sk is an old ASP site served as windows-1250 and expecting windows-1250
// URL-encoded query params. These helpers handle both directions.

const decoder = new TextDecoder("windows-1250");

// Slovak letters that differ from ASCII → their windows-1250 byte.
const WIN1250: Record<string, number> = {
  á: 0xe1,
  ä: 0xe4,
  č: 0xe8,
  ď: 0xef,
  é: 0xe9,
  í: 0xed,
  ĺ: 0xe5,
  ľ: 0xba,
  ň: 0xf2,
  ó: 0xf3,
  ô: 0xf4,
  ŕ: 0xe0,
  š: 0x9a,
  ť: 0x9d,
  ú: 0xfa,
  ý: 0xfd,
  ž: 0x9e,
  Á: 0xc1,
  Ä: 0xc4,
  Č: 0xc8,
  Ď: 0xcf,
  É: 0xc9,
  Í: 0xcd,
  Ĺ: 0xc5,
  Ľ: 0xa5,
  Ň: 0xd2,
  Ó: 0xd3,
  Ô: 0xd4,
  Ŕ: 0xc0,
  Š: 0x8a,
  Ť: 0x8d,
  Ú: 0xda,
  Ý: 0xdd,
  Ž: 0x8e,
};

function encodeWin1250(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (/[A-Za-z0-9]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else if (WIN1250[ch] !== undefined)
      out += `%${WIN1250[ch].toString(16).toUpperCase()}`;
    else if (code < 0x80) out += encodeURIComponent(ch);
    else {
      // Unmapped: strip the diacritic and encode the base letter.
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += /[A-Za-z0-9]/.test(base) ? base : "";
    }
  }
  return out;
}

async function getWin1250(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SBDesignLeadBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return "";
  return decoder.decode(await res.arrayBuffer());
}

export interface OrsrCompany {
  name: string;
  id: string;
  sid: string;
}

export interface OrsrDetail {
  ico: string | null;
  address: string | null;
  city: string | null;
  ownerName: string | null;
  ownerPosition: string | null;
  active: boolean; // false if struck off / deleted from the register
  statusNote: string | null; // e.g. "v likvidácii", "konkurz", "vymazaná"
}

function parseResults(html: string, limit: number): OrsrCompany[] {
  const $ = cheerio.load(html);
  const out: OrsrCompany[] = [];
  $('a[href*="vypis.asp"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/ID=(\d+)&(?:amp;)?SID=(\d+)&(?:amp;)?P=0/);
    if (!m) return;
    const name = $(a).text().replace(/\s+/g, " ").trim();
    if (name && !out.find((r) => r.id === m[1]))
      out.push({ name, id: m[1], sid: m[2] });
  });
  return out.slice(0, limit);
}

/** Search the register by company name / keyword. */
export async function searchCompanies(
  query: string,
  limit = 20,
): Promise<OrsrCompany[]> {
  const html = await getWin1250(
    `https://www.orsr.sk/hladaj_subjekt.asp?OBMENO=${encodeWin1250(query)}&PF=0&SID=0&S=on&R=on&lan=sk`,
  );
  return parseResults(html, limit);
}

/** Find the subject by IČO (exact). */
export async function searchByIco(ico: string): Promise<OrsrCompany | null> {
  const clean = ico.replace(/\D/g, "");
  if (!clean) return null;
  const html = await getWin1250(
    `https://www.orsr.sk/hladaj_ico.asp?ICO=${clean}&SID=0&lan=sk`,
  );
  return parseResults(html, 1)[0] ?? null;
}

const NAME_RE =
  /((?:(?:Ing|Mgr|JUDr|PhDr|MUDr|MVDr|RNDr|PaedDr|Bc|Dr|prof|doc|arch)\.?\s+)*[A-ZÁ-Ž][a-zá-žäôňčďĺľŕšťžýíéóú'-]+\s+[A-ZÁ-Ž][a-zá-žäôňčďĺľŕšťžýíéóú'-]+)/;

function extractCity(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(
    /\d+(?:\/\d+)?\s+([A-ZÁ-Ž][a-zá-žäôňčďĺľŕšťžýíéóú]+)/,
  );
  return m ? m[1] : null;
}

/** Aktuálny výpis → IČO, sídlo, city, konateľ name + position. */
export async function getCompanyDetail(
  id: string,
  sid: string,
): Promise<OrsrDetail> {
  const html = await getWin1250(
    `https://www.orsr.sk/vypis.asp?ID=${id}&SID=${sid}&P=0`,
  );
  const text = cheerio.load(html).text().replace(/\s+/g, " ");

  const ico =
    text.match(/IČO:\s*([\d ]+?)\s*\(od:/)?.[1]?.replace(/\s/g, "") ?? null;
  const address = text.match(/Sídlo:\s*(.+?)\s*\(od:/)?.[1]?.trim() ?? null;

  // Blok „Štatutárny orgán" až po nasledujúcu sekciu. Z neho zvlášť vytiahneme
  // funkciu (konateľ/predseda…) a zvlášť prvé meno osoby — tolerantnejšie než
  // jeden pevný vzor, ktorý padal, keď výpis nemal presne očakávané „(od:".
  let ownerName: string | null = null;
  let ownerPosition: string | null = null;
  const block = text.match(
    /Štatutárny orgán:\s*(.+?)(?:Spoločníci|Základné imanie|Konanie v mene|Ďalšie právne skutočnosti|Dozorná rada|Prokúra|$)/,
  )?.[1];
  if (block) {
    ownerPosition =
      block.match(
        /\b(konate[ľl]ia|konate[ľl]|predseda predstavenstva|[čc]len predstavenstva|podpredseda predstavenstva|generálny riaditeľ|spoločník a konateľ)\b/i,
      )?.[1] ?? null;
    // Preskoč prípadné „(od: …)" a adresné čísla — meno je prvá dvojica veľkých slov.
    ownerName = block.match(NAME_RE)?.[1]?.trim() ?? null;
    if (ownerPosition)
      ownerPosition = ownerPosition.replace(/\s+/g, " ").toLowerCase();
  }

  // Activity status: a "Dátum výmazu" (deletion) means the company no longer exists.
  let active = true;
  let statusNote: string | null = null;
  if (/Dátum výmazu:\s*\d/.test(text)) {
    active = false;
    statusNote = "vymazaná z registra";
  } else if (/v\s+likvid[aá]cii|vstup(?:e|u)?\s+do\s+likvid/i.test(text)) {
    statusNote = "v likvidácii";
  } else if (/konkurz|vyhlásenie\s+konkurzu/i.test(text)) {
    statusNote = "konkurz";
  }

  return {
    ico,
    address,
    city: extractCity(address),
    ownerName,
    ownerPosition,
    active,
    statusNote,
  };
}

/**
 * Best-effort enrichment for the scanner: prefer IČO, else the company name.
 * Returns the ORSR detail plus the matched register name, or null.
 */
export async function enrichCompany(input: {
  name?: string;
  ico?: string | null;
}): Promise<(OrsrDetail & { matchedName: string }) | null> {
  let match: OrsrCompany | null = null;
  if (input.ico) match = await searchByIco(input.ico);
  if (!match && input.name) {
    const results = await searchCompanies(input.name, 5);
    match = results[0] ?? null;
  }
  if (!match) return null;
  const detail = await getCompanyDetail(match.id, match.sid);
  return { ...detail, matchedName: match.name };
}
