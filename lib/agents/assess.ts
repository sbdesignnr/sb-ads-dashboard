// Skaut (Miro): odôvodnené posúdenie leadu. Z dát, ktoré o firme máme (analýza webu, odbor,
// kontakt), rozhodne, či sa oplatí ju osloviť, a ZDÔVODNÍ prečo: aká konkrétna príležitosť pre
// služby SB Design (web na mieru, e-shop, Meta a Google Ads) je v dátach doložená. Nevhodné
// leady sa skryjú s dôvodom, vhodné idú Nore. Každé posúdenie sa ukladá (agent_notes).
import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMessage, textFrom } from "@/lib/leads/ai";
import { lessonsBlock, writeNote } from "./notes";

export const SCOUT_MODEL = process.env.AGENT_SCOUT_MODEL?.trim() || "claude-sonnet-5";
/** Od tohto skóre sa lead považuje za vhodný (a musí mať doložený dôkaz). */
export const FIT_MIN = 6;
export const ARCHIVE_PREFIX = "Archivované pri čistom štarte";
export const VERDICT_VERSION = 2;
/** dôvody vyradenia, ktoré vznikli chybou v pravidlách v1 (chýbajúci e-mail): také posúdenia sa opakujú */
export const RETRY_REASON_RE = /e-?mail|nedá sa osloviť|neda sa oslovit|konate[ľl]|aktivit/i;

export interface Verdict {
  suitable: boolean;
  fit: number;
  size: string;
  nicheOk: boolean;
  /** hlavná príležitosť: web | eshop | ads | none */
  service: string;
  headline: string;
  /** dôkazy z dát (fakty o ich webe a firme), z ktorých príležitosť vyplýva */
  evidence: string[];
  why: string;
  risks: string[];
  rejectReason: string | null;
  source: "sken" | "výber" | "obnova";
  /** verzia pravidiel posúdenia (2 = e-mail a overenie aktivity nie sú kritérium) */
  v: number;
}

export type AssessLead = Lead & { segment: { name: string } | null };

const SYSTEM = `Si Miro, obchodný skaut štúdia SB Design (Samuel Bibeň, Nitra). SB Design predáva: WEB NA MIERU (nový alebo redizajn, vlastný kód), E-SHOP a META + GOOGLE ADS. Z dát o firmách rozhodneš, ktoré sa oplatí osloviť, a ZDÔVODNÍŠ prečo. Do zoznamu má prejsť len firma, pre ktorú je v dátach DOLOŽENÁ konkrétna príležitosť.

PRIORITNÉ ODBORY: realitné kancelárie, stavebné firmy a remeselníci, fyzioterapia a zdravotné služby (SK aj CZ).

VHODNÁ FIRMA (suitable=true) MUSÍ mať naraz:
1. malá firma (1 až 25 ľudí), rozhoduje majiteľ, patrí do uvedeného odboru,
2. aspoň jednu KONKRÉTNU príležitosť doloženú dátami (evidence), napr.: zastaraný alebo vizuálne slabý web (rok v pätičke, staré písmo a rozloženie), pomalý mobil (PageSpeed), web nie je prispôsobený mobilu, chýba HTTPS, zlé alebo chýbajúce kontaktné prvky, chýbajúca rezervácia alebo dopyt pri službe, kde je to bežné, technológia, ktorá sa už nevyvíja,
3. funkčný web (bez neho nie je čo posudzovať).

DÔLEŽITÉ: chýbajúci e-mail, neznámy konateľ a neoverená aktivita firmy NIE SÚ kritériom. E-maily dohľadáva kód osobitne a konateľa overuje register. NIKDY nevyraď firmu z týchto dôvodov, posudzuj IBA to, či je v dátach doložená príležitosť.

NEVHODNÁ FIRMA (suitable=false):
- web je moderný, rýchly a funkčný a dáta neukazujú žiadnu konkrétnu slabinu (nemáme čo ponúknuť),
- koncerny, siete pobočiek, franšízy, verejné inštitúcie, školy, e-shopy a veľkoobchod, agentúry a firmy, ktoré samy robia weby,
- firma podľa dát nepatrí do odboru (napr. stomatológ vo fyzioterapii),
- poškodený záznam (rozbité znaky v názve, telefón namiesto názvu), firma výslovne označená ako neaktívna ("aktívna: NIE").

PRAVIDLÁ
- Dôkazy (evidence) musia byť doslovné fakty z dát (napr. "rok v pätičke 2014", "PageSpeed mobil 38", "web nie je prispôsobený mobilu"), nie odhady. Bez doloženého faktu nie je príležitosť.
- "service": web | eshop | ads | none. "ads" len ak dáta nasvedčujú, že firma reklamu nevyužíva alebo ju web nepodporuje (napr. chýba meranie, formulár); inak "web" alebo "none".
- "why": 1 až 2 vety po slovensky, prečo je (alebo nie je) firma vhodná, jazykom, ktorému rozumie obchodník.
- "reject_reason" pri nevhodnej firme: jedna veta po slovensky, prečo vypadla (uvidí ju človek v zozname skrytých).
- Nič nevymýšľaj a nedomýšľaj. Kvalita rozhodnutia je dôležitejšia než počet vhodných.
Odpovedz VÝHRADNE JSON poľom v poradí zadania: [{"id","suitable":bool,"fit":0-10,"size":"solo|small|mid|large|chain|institution","niche_ok":bool,"service":"web|eshop|ads|none","headline":"jedna veta: čo im ponúknuť","evidence":["…"],"why":"…","risks":["…"],"reject_reason":"…alebo null"}]`;

const line = (l: AssessLead) =>
  [
    `id=${l.id}`,
    `${l.companyName}`,
    `mesto: ${l.companyCity ?? "?"}`,
    `odbor: ${l.segment?.name ?? "?"}`,
    `web: ${l.websiteUrl ?? "—"}`,
    `skóre zastaranosti webu: ${l.websiteScore ?? "neposúdené"}/100 (vyššie = horší web)`,
    `technológia: ${l.websiteTechnology ?? "?"}`,
    `rok v pätičke: ${l.copyrightYear ?? "?"}`,
    `PageSpeed mobil: ${l.pageSpeedMobile ?? "?"}`,
    `mobil: ${l.isMobileFriendly == null ? "?" : l.isMobileFriendly ? "prispôsobený" : "NIE JE prispôsobený"}`,
    `HTTPS: ${l.hasSsl == null ? "?" : l.hasSsl ? "áno" : "NIE"}`,
    `nedostatky: ${[...(l.websiteIssues ?? []), ...(l.visualIssues ?? [])].slice(0, 6).join("; ") || "—"}`,
    `vizuálny dojem: ${(l.aiVisualReason ?? "").slice(0, 200) || "—"}`,
    `o firme: ${(l.aiSummary ?? "").slice(0, 240) || "—"}`,
    ...(l.companyActive === false ? ["aktívna: NIE"] : []),
  ].join(" | ");

const asStrings = (v: unknown, n: number): string[] => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, n) : []);

/** Posúdi dávku leadov (1 volanie). Pri chybe vráti prázdnu mapu (lead sa nezmení). */
export async function assessLeads(leads: AssessLead[], source: Verdict["source"]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  if (!leads.length) return out;
  try {
    const client = new Anthropic();
    const lessons = await lessonsBlock("miro");
    const msg = await createMessage(client, {
      model: SCOUT_MODEL,
      max_tokens: 700 + leads.length * 420,
      temperature: 0,
      system: SYSTEM + lessons,
      messages: [{ role: "user", content: leads.map(line).join("\n") }],
    });
    const m = textFrom(msg).match(/\[[\s\S]*\]/);
    if (!m) return out;
    const rows = JSON.parse(m[0]) as {
      id?: string;
      suitable?: boolean;
      fit?: number;
      size?: string;
      niche_ok?: boolean;
      service?: string;
      headline?: string;
      evidence?: unknown;
      why?: string;
      risks?: unknown;
      reject_reason?: string | null;
    }[];
    for (const r of rows) {
      if (!r.id || !leads.some((l) => l.id === r.id)) continue;
      const evidence = asStrings(r.evidence, 5);
      const fit = Math.max(0, Math.min(10, Number(r.fit) || 0));
      const size = ["solo", "small", "mid", "large", "chain", "institution"].includes(String(r.size)) ? String(r.size) : "unknown";
      const nicheOk = r.niche_ok !== false;
      // vhodné len s doloženým dôkazom, správnym odborom a rozumnou veľkosťou (kód to overí, nielen model)
      const suitable = Boolean(r.suitable) && fit >= FIT_MIN && nicheOk && evidence.length > 0 && !["large", "chain", "institution"].includes(size);
      out.set(r.id, {
        suitable,
        fit,
        size,
        nicheOk,
        service: ["web", "eshop", "ads", "none"].includes(String(r.service)) ? String(r.service) : "none",
        headline: String(r.headline ?? "").slice(0, 240),
        evidence,
        why: String(r.why ?? "").slice(0, 400),
        risks: asStrings(r.risks, 3),
        rejectReason: suitable ? null : String(r.reject_reason || r.why || "Nie je doložená konkrétna príležitosť.").slice(0, 300),
        source,
        v: VERDICT_VERSION,
      });
    }
  } catch {
    /* bez posúdenia sa lead nemení */
  }
  return out;
}

/**
 * Uloží posúdenia: nevhodné leady sa skryjú (status "rejected" + dôvod "Miro: …", viditeľné v zozname
 * skrytých), vhodné ostanú (a archivované po čistom štarte sa vrátia). Každé posúdenie sa zapíše aj
 * ako poznámka (zdôvodnenie pre človeka).
 */
export async function applyVerdicts(leads: AssessLead[], verdicts: Map<string, Verdict>): Promise<{ suitable: number; rejected: number }> {
  let suitable = 0;
  let rejected = 0;
  for (const l of leads) {
    const v = verdicts.get(l.id);
    if (!v) continue;
    await writeNote({
      agent: "miro",
      kind: "verdict",
      leadId: l.id,
      title: `${v.suitable ? "Vhodný" : "Nevhodný"}: ${l.companyName}`,
      body: v.why,
      data: v,
    });
    const reason = l.disqualifyReason ?? "";
    // lead skrytý pri čistom štarte alebo skorším (chybným) posúdením Mira sa môže vrátiť
    const reopenable = l.status === "rejected" && (reason.startsWith(ARCHIVE_PREFIX) || reason.startsWith("Miro:"));
    if (v.suitable) {
      suitable++;
      if (reopenable) await prisma.lead.update({ where: { id: l.id }, data: { status: "new", disqualifyReason: null } }).catch(() => {});
    } else {
      rejected++;
      if (l.status === "new" || reopenable)
        await prisma.lead
          .update({ where: { id: l.id }, data: { status: "rejected", disqualifyReason: `Miro: ${v.rejectReason}`.slice(0, 300) } })
          .catch(() => {});
    }
  }
  return { suitable, rejected };
}
