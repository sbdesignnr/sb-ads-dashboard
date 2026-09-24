// Oprava "mojibake" — pokazenej diakritiky z dvojitého kódovania (UTF-8 text prečítaný
// ako windows-1252): "Vesnala LekÃ¡reÅˆ" → "Vesnala Lekáreň", "Å½ateÄka" → "Žatečka".
// Zdroj: export z TrustedLeads (niektoré názvy prídu už pokazené). Pokazený názov
// firmy by sa nedal nájsť v registri a v mailoch by vyzeral ako chyba.

// windows-1252: znaky v rozsahu 0x80-0x9F majú vlastné Unicode kódy.
const CP1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

// Typický začiatok pokazenej sekvencie: Ã / Å / Ä / Â / â nasledované "cudzím" znakom.
const SUSPECT = /[ÃÅÄÂâ][\u0080-ÿŒœŠšŸŽžƒˆ˜–-›€™]/;

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/** Vráti opravený text, alebo pôvodný, ak nejde o mojibake / oprava sa nedá spoľahlivo spraviť. */
export function fixMojibake(input: string | null | undefined): string {
  const s = input ?? "";
  if (!s || !SUSPECT.test(s)) return s;
  try {
    const bytes: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c < 0x100) bytes.push(c);
      else if (CP1252_TO_BYTE[c] !== undefined) bytes.push(CP1252_TO_BYTE[c]);
      else return s; // znak mimo windows-1252 → nebol to čistý mojibake
    }
    const out = strictUtf8.decode(Uint8Array.from(bytes)).normalize("NFC");
    // Oprava musí zlepšiť text: menej podozrivých sekvencií a žiadny náhradný znak.
    if (out.includes("�") || SUSPECT.test(out)) return s;
    return out;
  } catch {
    return s; // nie je to platný UTF-8 → nechaj tak
  }
}

/** Opraví text a oreže okolité medzery; prázdny výsledok = null. */
export function cleanText(input: string | null | undefined): string | null {
  const v = fixMojibake(input).replace(/\s+/g, " ").trim();
  return v || null;
}
