import type { EmailTemplate } from "@prisma/client";

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
}

/**
 * Nahradí zástupné značky v šablóne konkrétnymi údajmi leadu. Podporované:
 *   {{firma}} {{mesto}} {{web}} {{konatel}}
 * Značka bez hodnoty sa nahradí prázdnym reťazcom (nikdy nezostane „{{firma}}"
 * v odoslanom maile). Rozpoznáva aj medzery vo vnútri: „{{ firma }}".
 */
export function fillTemplate(text: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    firma: vars.firma?.trim() || "",
    mesto: vars.mesto?.trim() || "",
    web: vars.web?.trim() || "",
    konatel: vars.konatel?.trim() || "",
  };
  return text.replace(
    /\{\{\s*(firma|mesto|web|konatel)\s*\}\}/gi,
    (_, key: string) => map[key.toLowerCase()] ?? "",
  );
}

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{{firma}}", label: "názov firmy" },
  { token: "{{konatel}}", label: "meno konateľa" },
  { token: "{{mesto}}", label: "mesto" },
  { token: "{{web}}", label: "web" },
] as const;
