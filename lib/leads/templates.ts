import type { EmailTemplate } from "@prisma/client";
import { cityLocative, krajForCity } from "./regions-map";

export interface EmailTemplateDTO {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  useCount: number;
  updatedAt: string;
}

export function serializeTemplate(t: EmailTemplate): EmailTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
    useCount: t.useCount,
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Údaje leadu, ktorými sa nahradia zástupné značky v šablóne. */
export interface TemplateVars {
  firma?: string | null;
  mesto?: string | null;
  web?: string | null;
  konatel?: string | null;
  /** Kraj — ak nie je zadaný, dopočíta sa z mesta. */
  kraj?: string | null;
}

// Akademické tituly (pred menom). Token končiaci bodkou berieme tiež ako titul.
const TITLE_RE =
  /^(ing|mgr|judr|phdr|mudr|mvdr|rndr|paeddr|pharmdr|thdr|thlic|bc|dr|prof|doc|akad|arch)\.?$/i;

/** Rozdelí celé meno na (vedúce) tituly a mená (krstné … priezvisko). */
function splitName(full?: string | null): {
  titles: string[];
  names: string[];
} {
  const tokens = (full ?? "").trim().split(/\s+/).filter(Boolean);
  const titles: string[] = [];
  let i = 0;
  while (
    i < tokens.length &&
    (/\.$/.test(tokens[i]) || TITLE_RE.test(tokens[i]))
  ) {
    titles.push(tokens[i]);
    i++;
  }
  return { titles, names: tokens.slice(i) };
}

/**
 * Oslovovacie meno konateľa: titul + priezvisko, ak je titul; inak samotné
 * priezvisko. Bez krstného mena. Napr. „Ing. Peter Paško" → „Ing. Paško",
 * „Jana Nováková" → „Nováková".
 */
function surnameWithTitle(full?: string | null): string {
  const { titles, names } = splitName(full);
  if (!names.length) return (full ?? "").trim();
  const surname = names[names.length - 1];
  return titles.length ? `${titles.join(" ")} ${surname}` : surname;
}

/**
 * Odhad pohlavia konateľa zo slovenského mena → „pán" / „pani". Priezvisko na
 * -ová alebo prídavné -á = žena, -ý = muž; inak krstné meno na -a = žena. Inak muž.
 */
function salutation(full?: string | null): string {
  const { names } = splitName(full);
  if (!names.length) return "";
  const surname = names[names.length - 1];
  const first = names[0];
  let female: boolean;
  if (/ová$/i.test(surname)) female = true;
  else if (/á$/.test(surname))
    female = true; // Veselá, Malá, Novotná
  else if (/ý$/.test(surname))
    female = false; // Veselý, Novotný
  else female = names.length >= 2 && /a$/i.test(first); // Jana, Petra, Eva …
  return female ? "pani" : "pán";
}

/**
 * Nahradí zástupné značky v šablóne konkrétnymi údajmi leadu. Podporované:
 *   {{firma}} {{mesto}} {{v_meste}} {{kraj}} {{web}} {{konatel}} {{meno}} {{pan}}
 * {{v_meste}} dá mesto v lokáli; {{meno}} dá (titul +) priezvisko; {{pan}} dá
 * „pán"/„pani" podľa pohlavia. Značka bez hodnoty sa nahradí prázdnym reťazcom
 * (nikdy nezostane „{{firma}}" v maile). Rozpoznáva aj medzery: „{{ firma }}".
 */
export function fillTemplate(text: string, vars: TemplateVars): string {
  const mesto = vars.mesto?.trim() || "";
  const konatel = vars.konatel?.trim() || "";
  const map: Record<string, string> = {
    firma: vars.firma?.trim() || "",
    mesto,
    v_meste: cityLocative(mesto),
    kraj: (vars.kraj?.trim() || krajForCity(mesto)) ?? "",
    web: vars.web?.trim() || "",
    konatel,
    meno: surnameWithTitle(konatel),
    pan: salutation(konatel),
  };
  return text.replace(
    /\{\{\s*(firma|mesto|v_meste|kraj|web|konatel|meno|pan)\s*\}\}/gi,
    (_, key: string) => map[key.toLowerCase()] ?? "",
  );
}

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{{firma}}", label: "názov firmy" },
  { token: "{{konatel}}", label: "konateľ (celé meno)" },
  { token: "{{meno}}", label: "priezvisko (s titulom, ak je)" },
  { token: "{{pan}}", label: "pán / pani (podľa pohlavia)" },
  { token: "{{mesto}}", label: "mesto (Košice)" },
  { token: "{{v_meste}}", label: "mesto v tvare 'v Košiciach'" },
  { token: "{{kraj}}", label: "kraj" },
  { token: "{{web}}", label: "web" },
] as const;
