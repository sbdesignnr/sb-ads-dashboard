// Overený konateľ pre oslovenie: ak lead ešte nemá meno potvrdené registrom, webom alebo ručne, agent ho
// dohľadá v obchodnom registri (ČR: ARES cez IČO, SR: ORSR) a zapíše. IČO sa berie z leadu alebo z textu
// webu firmy (právne stránky). Meno sa použije LEN ak ho potvrdí register (rovnaké pravidlá ako tlačidlo
// "Z registra": radšej žiadne meno než meno inej osoby).
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCzLead } from "@/lib/leads/scanner";
import { verifyOwner } from "@/lib/leads/owner-verification";
import { isVerifiedOwnerSource } from "@/lib/leads/owner-source";
import { icoChecksumValid } from "@/lib/leads/website-analyzer";

/** Prvé platné IČO (8 číslic s kontrolným súčtom) pri značke "IČO"/"IČ" v texte. */
export function icoFromText(text: string): string | null {
  for (const m of text.matchAll(/\bI[ČC]O?\b[^0-9]{0,12}((?:\d[\s ]?){8})/gi)) {
    const digits = m[1].replace(/\D/g, "");
    if (digits.length === 8 && icoChecksumValid(digits)) return digits;
  }
  return null;
}

/**
 * Vráti lead s doplneným overeným konateľom (ak sa ho podarilo dohľadať). Nikdy nehádže: pri chybe registra
 * vráti pôvodný lead.
 */
export async function ensureOwner(lead: Lead, opts: { siteText?: string } = {}): Promise<{ lead: Lead; found: boolean; note: string }> {
  if (isVerifiedOwnerSource(lead.ownerSource) && lead.ownerName) return { lead, found: true, note: "meno už je overené" };
  try {
    const ico = lead.ico || (opts.siteText ? icoFromText(opts.siteText) : null);
    const ver = await verifyOwner({
      companyName: lead.companyName,
      city: lead.companyCity,
      ico,
      websiteUrl: lead.websiteUrl,
      cz: isCzLead(lead),
      candidate: { name: lead.ownerName, position: lead.ownerPosition },
      siteText: opts.siteText ?? null,
      trustIco: Boolean(lead.ico),
      email: lead.companyEmail,
    });
    const reg = ver.registry;
    const regTrusted = Boolean(reg && (reg.nameMatches || ver.owner?.source === "registry"));
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(reg && regTrusted
          ? { ico: reg.ico ?? ico ?? undefined, companyCity: lead.companyCity ?? reg.city ?? undefined, companyAddress: lead.companyAddress ?? reg.address ?? undefined, companyActive: reg.active }
          : ico && !lead.ico
            ? { ico }
            : {}),
        ...(ver.owner && lead.ownerSource !== "manual"
          ? { ownerName: ver.owner.name, ownerPosition: ver.owner.position ?? lead.ownerPosition ?? undefined, ownerSource: ver.owner.source }
          : {}),
        ownerCheckedAt: new Date(),
      },
    });
    return { lead: updated, found: Boolean(ver.owner), note: ver.reason };
  } catch (e) {
    return { lead, found: false, note: `register nedostupný: ${(e as Error).message.slice(0, 80)}` };
  }
}
