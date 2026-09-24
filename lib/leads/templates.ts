import type { EmailTemplate } from "@prisma/client";
import { cityLocative, krajForCity } from "./regions-map";
import { buildGreeting, genderOf, parseName } from "./person-name";

export interface EmailTemplateDTO {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  segmentId: string | null;
  segmentName: string | null;
  useCount: number;
  updatedAt: string;
}

export function serializeTemplate(
  t: EmailTemplate & { segment?: { name: string } | null },
): EmailTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
    segmentId: t.segmentId ?? null,
    segmentName: t.segment?.name ?? null,
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

/**
 * Oslovovacie meno konateľa: titul + priezvisko, ak je titul; inak samotné
 * priezvisko. Bez krstného mena. Napr. „Ing. Peter Paško" → „Ing. Paško",
 * „Jana Nováková" → „Nováková".
 */
function surnameWithTitle(full?: string | null): string {
  const p = full ? parseName(full) : null;
  if (!p) return (full ?? "").trim();
  return p.titlesBefore.length ? `${p.titlesBefore.join(" ")} ${p.surname}` : p.surname;
}

/** „pán" / „pani" podľa rodu; pri nejasnom rode prázdne (radšej bez než zle). */
function salutation(full?: string | null): string {
  const g = full ? genderOf(full) : null;
  return g === "f" ? "pani" : g === "m" ? "pán" : "";
}

/**
 * Nahradí zástupné značky v šablóne konkrétnymi údajmi leadu. Podporované:
 *   {{firma}} {{mesto}} {{v_meste}} {{kraj}} {{web}} {{konatel}} {{meno}} {{pan}} {{oslovenie}}
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
    // Hotový riadok oslovenia: "Dobrý deň, pán Novák," alebo (bez overeného mena) "Dobrý deň,".
    oslovenie: buildGreeting(konatel || null).line,
  };
  const filled = text.replace(
    /\{\{\s*(firma|mesto|v_meste|kraj|web|konatel|meno|pan|oslovenie)\s*\}\}/gi,
    (_, key: string) => map[key.toLowerCase()] ?? "",
  );
  // Prázdna značka (napr. neoverený konateľ → {{pan}} {{meno}}) nesmie nechať
  // "Dobrý deň, ," ani dvojité medzery: "Dobrý deň, {{pan}} {{meno}}," → "Dobrý deň,".
  return filled
    .replace(/[ \t]+,/g, ",")
    .replace(/,(?:[ \t]*,)+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{{firma}}", label: "názov firmy" },
  { token: "{{konatel}}", label: "konateľ (celé meno)" },
  { token: "{{meno}}", label: "priezvisko (s titulom, ak je)" },
  { token: "{{pan}}", label: "pán / pani (podľa pohlavia)" },
  { token: "{{oslovenie}}", label: "hotové oslovenie (Dobrý deň, pán Novák,)" },
  { token: "{{mesto}}", label: "mesto (Košice)" },
  { token: "{{v_meste}}", label: "mesto v tvare 'v Košiciach'" },
  { token: "{{kraj}}", label: "kraj" },
  { token: "{{web}}", label: "web" },
] as const;
