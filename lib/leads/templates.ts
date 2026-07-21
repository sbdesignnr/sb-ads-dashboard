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

/** Prvé (krstné) meno z celého mena — na oslovenie „Dobrý deň, Peter". */
function firstName(full?: string | null): string {
  const t = (full ?? "").trim();
  if (!t) return "";
  // Preskoč tituly ako Ing., Mgr., Bc. …
  const parts = t.split(/\s+/).filter((p) => !/\.$/.test(p));
  return parts[0] ?? "";
}

/**
 * Nahradí zástupné značky v šablóne konkrétnymi údajmi leadu. Podporované:
 *   {{firma}} {{mesto}} {{v_meste}} {{kraj}} {{web}} {{konatel}} {{meno}}
 * {{v_meste}} dá mesto v lokáli („v Košiciach", „vo Zvolene"); {{meno}} dá krstné
 * meno konateľa. Značka bez hodnoty sa nahradí prázdnym reťazcom (nikdy nezostane
 * „{{firma}}" v odoslanom maile). Rozpoznáva aj medzery: „{{ firma }}".
 */
export function fillTemplate(text: string, vars: TemplateVars): string {
  const mesto = vars.mesto?.trim() || "";
  const map: Record<string, string> = {
    firma: vars.firma?.trim() || "",
    mesto,
    v_meste: cityLocative(mesto),
    kraj: (vars.kraj?.trim() || krajForCity(mesto)) ?? "",
    web: vars.web?.trim() || "",
    konatel: vars.konatel?.trim() || "",
    meno: firstName(vars.konatel),
  };
  return text.replace(
    /\{\{\s*(firma|mesto|v_meste|kraj|web|konatel|meno)\s*\}\}/gi,
    (_, key: string) => map[key.toLowerCase()] ?? "",
  );
}

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{{firma}}", label: "názov firmy" },
  { token: "{{konatel}}", label: "meno konateľa (celé)" },
  { token: "{{meno}}", label: "krstné meno konateľa" },
  { token: "{{mesto}}", label: "mesto (Košice)" },
  { token: "{{v_meste}}", label: "mesto v tvare 'v Košiciach'" },
  { token: "{{kraj}}", label: "kraj" },
  { token: "{{web}}", label: "web" },
] as const;
