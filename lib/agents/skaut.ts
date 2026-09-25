// Skaut (Miro): vyberá z leadov tie, ktoré sa naozaj oplatí osloviť, a vysvetlí prečo.
// Celé je to deterministický kód (0 € za AI): skóre príležitosti 0–100 z toho, čo o leade
// už vieme (slabý web, overený konateľ, aktívna firma, prioritný odbor…).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QUALIFY_AT } from "@/lib/leads/qualification";
import { isVerifiedOwnerSource } from "@/lib/leads/owner-source";
import type { ScoutNote } from "@/lib/leads/research/council";
import { FIT_MIN, triageLeads, type Triage } from "./triage";

/** Prioritné odbory (rozhodnutie usera 24. 9. 2026): realitné kancelárie, stavebné firmy, fyzioterapeuti. */
export const PRIORITY_SEGMENT_RE = /realit|stave?b|fyzio/i;

export interface OpportunityLead {
  id: string;
  companyName: string;
  companyCity: string | null;
  websiteUrl: string | null;
  websiteScore: number | null;
  companyEmail: string | null;
  ownerSource: string | null;
  companyActive: boolean | null;
  copyrightYear: number | null;
  hasSsl: boolean | null;
  isMobileFriendly: boolean | null;
  pageSpeedMobile: number | null;
  segment: { name: string } | null;
}

export interface Opportunity {
  lead: OpportunityLead;
  score: number;
  reasons: string[];
}

const GENERIC_MAILBOX = /^(info|office|kontakt|contact|sekretariat|recepcia|obchod|podatelna|posta|hello|ahoj|mail)@/i;

export function opportunityScore(l: OpportunityLead): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // slabý web = dôvod na oslovenie (0–40)
  const ws = l.websiteScore ?? 0;
  const weak = Math.max(0, Math.min(40, ((ws - QUALIFY_AT) / (68 - QUALIFY_AT)) * 40));
  score += weak;
  if (weak >= 12) reasons.push(`Zastaraný web (skóre ${ws})`);

  const year = new Date().getFullYear();
  if (l.copyrightYear && l.copyrightYear <= year - 8) {
    score += 6;
    reasons.push(`Pätička webu z roku ${l.copyrightYear}`);
  } else if (l.copyrightYear && l.copyrightYear <= year - 5) score += 3;
  if (l.hasSsl === false) {
    score += 5;
    reasons.push("Web nemá HTTPS");
  }
  if (l.isMobileFriendly === false) {
    score += 6;
    reasons.push("Web nie je prispôsobený mobilu");
  }
  if (l.pageSpeedMobile != null && l.pageSpeedMobile < 40) {
    score += 4;
    reasons.push(`Pomalý na mobile (PageSpeed ${l.pageSpeedMobile})`);
  }

  // dosiahnuteľnosť (0–24): mail sa dá poslať a vieme komu
  if (isVerifiedOwnerSource(l.ownerSource)) {
    score += 14;
    reasons.push("Overený konateľ (dá sa osloviť menom)");
  }
  if (l.companyEmail) {
    score += 6;
    if (!GENERIC_MAILBOX.test(l.companyEmail)) {
      score += 4;
      reasons.push("Osobná schránka, nie info@");
    }
  }

  // kvalita firmy a odbor
  if (l.companyActive === true) score += 4;
  if (l.segment && PRIORITY_SEGMENT_RE.test(l.segment.name)) {
    score += 10;
    reasons.push(`Prioritný odbor (${l.segment.name})`);
  }
  return { score: Math.round(Math.min(100, score)), reasons };
}

const baseWhere = (): Prisma.LeadWhereInput => ({
  status: "new",
  websiteUrl: { not: null },
  websiteScore: { gte: QUALIFY_AT },
  companyEmail: { not: null },
  // Pozor: NOT (company_active = false) by vyradilo aj NULL, preto výslovne OR.
  AND: [{ NOT: { companyEmail: "" } }, { OR: [{ companyActive: null }, { companyActive: true }] }],
  emails: { none: { status: { in: ["approved", "sent"] } } },
});

const select = {
  id: true,
  companyName: true,
  companyCity: true,
  websiteUrl: true,
  websiteScore: true,
  companyEmail: true,
  ownerSource: true,
  companyActive: true,
  copyrightYear: true,
  hasSsl: true,
  isMobileFriendly: true,
  pageSpeedMobile: true,
  segment: { select: { name: true } },
} as const;

/** Najlepšie príležitosti, ktoré Nora ešte neskúmala (prioritné odbory). */
export async function getShortlist(
  limit = 20,
  opts: { includeResearched?: boolean; anySegment?: boolean } = {},
): Promise<{ picks: Opportunity[]; candidates: number }> {
  // Lead s hotovým alebo bežiacim výskumom sa nevyberá znova; neúspešný sa smie zopakovať,
  // ale najviac 2× (aby sa nepodarený lead nekonečne nepálil).
  const where: Prisma.LeadWhereInput = {
    ...baseWhere(),
    ...(opts.includeResearched ? {} : { research: { none: { status: { in: ["done", "running"] } } } }),
  };
  const rows = await prisma.lead.findMany({
    where,
    orderBy: { websiteScore: "desc" },
    take: 600,
    select: { ...select, _count: { select: { research: { where: { status: "failed" } } } } },
  });
  const scored = rows
    .filter((r) => r._count.research < 2)
    .filter((r) => opts.anySegment || (r.segment && PRIORITY_SEGMENT_RE.test(r.segment.name)))
    .map((lead) => ({ lead, ...opportunityScore(lead) }))
    .sort((a, b) => b.score - a.score);
  return { picks: scored.slice(0, limit), candidates: scored.length };
}

/** Zásoba čerstvých vhodných leadov v prioritných odboroch (pre rozhodnutie, či hľadať nové). */
export async function backlogCount(): Promise<number> {
  return prisma.lead.count({
    where: {
      ...baseWhere(),
      segment: {
        is: {
          OR: ["realit", "stavebn", "fyzio"].map((k) => ({ name: { contains: k, mode: "insensitive" as const } })),
        },
      },
    },
  });
}

export interface ScoutPick {
  opportunity: Opportunity;
  note: ScoutNote;
}

const BAD_SIZE = new Set(["large", "chain", "institution"]);

/**
 * Výber pre nočný režim: z najlepších kandidátov vyradí (Haiku predfilter) koncerny, inštitúcie
 * a nesprávne zaradené firmy a vráti prvých `count` vhodných aj s poznámkou pre Noru.
 * Vyradené leady dostanú status "rejected" s dôvodom (vidno v zozname leadov).
 */
export async function pickWithTriage(count = 1, look = 6): Promise<{ picks: ScoutPick[]; rejected: { id: string; company: string; reason: string }[] }> {
  const { picks } = await getShortlist(look);
  if (!picks.length) return { picks: [], rejected: [] };
  const extra = await prisma.lead.findMany({
    where: { id: { in: picks.map((p) => p.lead.id) } },
    select: { id: true, aiSummary: true, aiPainPoint: true, aiOpportunity: true, websiteTechnology: true, websiteIssues: true, visualIssues: true, industry: true, ownerName: true },
  });
  const byId = new Map(extra.map((e) => [e.id, e]));
  const verdicts = await triageLeads(
    picks.map((p) => ({
      ...p.lead,
      aiSummary: null, aiPainPoint: null, aiOpportunity: null, websiteTechnology: null, websiteIssues: [], visualIssues: [], industry: null, ownerName: null,
      ...byId.get(p.lead.id),
    })),
  );
  const chosen: ScoutPick[] = [];
  const rejected: { id: string; company: string; reason: string }[] = [];
  for (const p of picks) {
    const t: Triage | undefined = verdicts.get(p.lead.id);
    const bad = t && (t.fit < FIT_MIN || !t.nicheOk || BAD_SIZE.has(t.size));
    if (bad && t) {
      const reason = `Miro: nevhodný cieľ (${t.fit}/10${t.redFlags.length ? ", " + t.redFlags.join(", ") : ""}). ${t.reason}`.slice(0, 300);
      await prisma.lead.update({ where: { id: p.lead.id }, data: { status: "rejected", disqualifyReason: reason } }).catch(() => {});
      rejected.push({ id: p.lead.id, company: p.lead.companyName, reason });
      continue;
    }
    if (chosen.length < count)
      chosen.push({
        opportunity: p,
        note: { fit: t?.fit ?? null, size: t?.size ?? null, reasons: p.reasons, hint: t?.hint ?? "", verdict: t?.reason ?? "" },
      });
  }
  return { picks: chosen, rejected };
}
