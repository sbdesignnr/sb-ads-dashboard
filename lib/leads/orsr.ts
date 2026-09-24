import * as cheerio from "cheerio";
import { looseSamePerson } from "./person-name";
import {
  plausibleSameCompany,
  sameCity,
  strictCompanyMatch,
} from "./company-match";

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
  // ORSR občas neodpovie alebo vráti chybu — jeden opakovací pokus, aby sa
  // prechodný výpadok nezamieňal za "firma v registri neexistuje".
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SBDesignLeadBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return decoder.decode(await res.arrayBuffer());
    } catch {
      /* skús znova */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return "";
}

export interface OrsrCompany {
  name: string;
  id: string;
  sid: string;
}

/** Osoba v štatutárnom orgáne firmy (aktuálny výpis). */
export interface RegistryPerson {
  name: string;
  position: string | null;
}

export interface OrsrDetail {
  ico: string | null;
  address: string | null;
  city: string | null;
  /** Všetci AKTUÁLNI členovia štatutárneho orgánu (konatelia, predstavenstvo…). */
  owners: RegistryPerson[];
  /** Prvý z `owners` (spätná kompatibilita). */
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

const ROLE_RE =
  /(konate[ľl]ia|konate[ľl]|predseda predstavenstva|podpredseda predstavenstva|[čc]len predstavenstva|generálny riaditeľ|riadite[ľl]|spoločník a konateľ|likvidátor|správca)/gi;

const LEGAL_ENTITY_RE =
  /\b(s\.\s?r\.\s?o\.?|spol\.|a\.\s?s\.?|k\.\s?s\.?|v\.\s?o\.\s?s\.?|z\.\s?o\.?|n\.\s?o\.?|IČO|GmbH|Ltd|Inc)\b/i;

const NAME_PARTICLES = new Set(["van", "von", "de", "di", "da", "del", "der", "den", "la", "le", "el", "al", "ben", "bin", "mc", "st"]);

/** Vyzerá reťazec ako meno osoby (nie firma/adresa)? */
function looksLikePersonName(s: string): boolean {
  if (!s || /\d/.test(s) || LEGAL_ENTITY_RE.test(s) || /\(od:|Vznik|funkcie/i.test(s)) return false;
  const tokens = s.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 8) return false;
  return tokens.every((t) => {
    // Titul: krátky token s bodkou, aj malými písmenami ("arch.", "Ing.arch.", "PhD.").
    if (/^[A-Za-z]+(?:\.[A-Za-z]+)*\.$/.test(t) && t.length <= 12) return true;
    if (NAME_PARTICLES.has(t.toLowerCase())) return true;
    return /^\p{Lu}[\p{L}'’-]+\.?$/u.test(t);
  });
}

function normalizeRole(role: string | null): string | null {
  if (!role) return null;
  const r = role.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^konate[ľl]ia?$/.test(r)) return "konateľ";
  return r;
}

/**
 * Z bloku "Štatutárny orgán" vytiahne VŠETKÝCH aktuálnych členov. Reálny formát:
 *   "konatelia (od: 25.06.2015) Martin Ďuriška Dátum narodenia: 19.03.1984 Vznik
 *    funkcie: 22.09.2016 (od: 13.11.2019) Danko Gages Dátum narodenia: …"
 * Meno leží medzi posledným "(od: dátum)" a "Dátum narodenia:" — vďaka tomu sa
 * neodreže priezvisko pri viacerých krstných menách ("Alain Michel Müller"),
 * čo robil predošlý regex na prvé dve slová. Právnická osoba v orgáne nemá
 * "Dátum narodenia", takže sa prirodzene preskočí.
 */
export function parseStatutoryPersons(block: string): RegistryPerson[] {
  const out: RegistryPerson[] = [];
  const dob = /Dátum narodenia:/g;
  let m: RegExpExecArray | null;
  while ((m = dob.exec(block))) {
    const before = block.slice(0, m.index);
    const od = [...before.matchAll(/\(od:\s*\d{1,2}\.\d{1,2}\.\d{4}\)/g)].pop();
    if (!od || od.index === undefined) continue;
    let name = before
      .slice(od.index + od[0].length)
      .replace(/\s+/g, " ")
      .trim();
    // Pri a.s. je funkcia ZA menom: "Ing. Michal Reiter - člen predstavenstva".
    let inlineRole: string | null = null;
    const dash = name.split(/\s+[-–]\s+/);
    if (dash.length === 2) {
      name = dash[0].trim();
      inlineRole = dash[1].match(ROLE_RE)?.[0] ?? null;
      ROLE_RE.lastIndex = 0;
    }
    // Prípadná adresa za menom ("Ján Novák, Hlavná 5, 811 01 Bratislava") — odrež
    // od prvého segmentu s číslicou (titul "PhD." za čiarkou ostane).
    const segs = name.split(",");
    const cut = segs.findIndex((s) => /\d/.test(s));
    if (cut > 0) name = segs.slice(0, cut).join(",").trim();
    // Register občas dáva medzeru pred čiarkou ("Králová , ArtD.") — zjednoť.
    name = name.replace(/\s+,/g, ",").replace(/\bIng\.arch\./g, "Ing. arch.");
    if (!looksLikePersonName(name)) continue;
    const role =
      inlineRole ?? [...before.slice(0, od.index).matchAll(ROLE_RE)].pop()?.[1] ?? null;
    out.push({ name, position: normalizeRole(role) });
  }
  // duplicity (rovnaká osoba dvakrát)
  return out.filter((p, i) => out.findIndex((q) => q.name === p.name) === i);
}

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

  // Blok „Štatutárny orgán" až po nasledujúcu sekciu; z neho všetci aktuálni členovia.
  const block = text.match(
    /Štatutárny orgán:\s*(.+?)(?:Spoločníci|Základné imanie|Konanie (?:v mene|menom)|Ďalšie právne skutočnosti|Dozorná rada|Prokúra|$)/,
  )?.[1];
  const owners = block ? parseStatutoryPersons(block) : [];
  const ownerName = owners[0]?.name ?? null;
  const ownerPosition = owners[0]?.position ?? null;

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
    owners,
    ownerName,
    ownerPosition,
    active,
    statusNote,
  };
}

export type RegistryMatchType = "ico" | "name";

/**
 * Vyhľadanie firmy v ORSR pre overenie konateľa.
 *  - Ak poznáme IČO: presné vyhľadanie podľa IČO a kontrola, že výpis naozaj nesie
 *    to isté IČO. `nameMatches` hovorí, či aj názov sedí (chráni pred IČO
 *    webagentúry v pätičke — vtedy sa osoba musí overiť inak).
 *  - Bez IČO: hľadanie podľa názvu, ale výsledok sa NIKDY neberie naslepo — názov
 *    musí prísne sedieť a mesto sídla musí byť rovnaké (ak ho poznáme), inak
 *    nič. Radšej žiadny konateľ než konateľ inej firmy.
 */
export async function enrichCompany(input: {
  name?: string | null;
  ico?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
  /** IČO zadal človek ručne / je overené — preskoč kontrolu podobnosti názvu. */
  trustIco?: boolean;
  /** Kontakt z importu — ak je v štatutárnom orgáne, nájdená firma je overená aj pri inom meste. */
  personName?: string | null;
}): Promise<
  | (OrsrDetail & {
      matchedName: string;
      matchType: RegistryMatchType;
      /** Názov v registri vyzerá ako názov leadu (pri zhode podľa IČO nemusí — značka vs. právny názov). */
      nameMatches: boolean;
    })
  | null
> {
  const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

  if (input.ico) {
    const match = await searchByIco(input.ico);
    if (!match) return null;
    const detail = await getCompanyDetail(match.id, match.sid);
    // Hľadali sme presne podľa IČO, takže výsledok je ono. Ak sa na výpise IČO
    // podarilo prečítať a NESEDÍ, výsledok zahodíme; ak sa neprečítalo, nevadí.
    if (detail.ico && digits(detail.ico) !== digits(input.ico)) return null;
    if (!detail.owners.length && !detail.address) return null; // prázdny/nedostupný výpis
    // Značka vs. právny názov (Nehnuteľnosti.sk = United Classifieds s.r.o.) sa
    // líšia legitímne, preto IČO nezamietame — len označíme, či názov sedí.
    // Overenie osoby potom rozhodne podľa zhody mena s členom orgánu.
    const nameMatches =
      Boolean(input.trustIco) ||
      !input.name ||
      plausibleSameCompany(input.name, match.name, input.websiteUrl);
    return { ...detail, matchedName: match.name, matchType: "ico", nameMatches };
  }

  if (!input.name) return null;
  const results = await searchCompanies(input.name, 8);
  const candidates = results.filter((r) => strictCompanyMatch(input.name!, r.name));
  type Found = OrsrDetail & {
    matchedName: string;
    matchType: RegistryMatchType;
    nameMatches: boolean;
  };
  const accepted: { found: Found; personMatch: boolean }[] = [];
  for (const c of candidates.slice(0, 3)) {
    const detail = await getCompanyDetail(c.id, c.sid);
    const city = sameCity(input.city, detail.city);
    // Osoba z importu je v orgáne = silný dôkaz (názov + osoba), aj keď sa sídlo
    // v registri líši od mesta prevádzky v CSV.
    const personMatch = Boolean(
      input.personName && detail.owners.some((o) => looseSamePerson(o.name, input.personName!)),
    );
    // Bez zhody osoby: známe mesto musí sedieť; ak ho nepoznáme, prejde len
    // jediný kandidát.
    if (!personMatch) {
      if (city === false) continue;
      if (city === null && candidates.length > 1) continue;
    }
    accepted.push({
      found: { ...detail, matchedName: c.name, matchType: "name", nameMatches: true },
      personMatch,
    });
  }
  // Viac zhôd = nejednoznačné → uprednostni jedinú so zhodou osoby, inak nič.
  const byPerson = accepted.filter((a) => a.personMatch);
  if (byPerson.length === 1) return byPerson[0].found;
  return accepted.length === 1 ? accepted[0].found : null;
}
