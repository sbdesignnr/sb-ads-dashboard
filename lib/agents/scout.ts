// Autopilot Skauta (Miro): sám hľadá firmy, posudzuje ich a posúva ďalej, bez zásahu človeka.
// Jeden cyklus (volá ho cron): (1) analyzuje neanalyzované prioritné leady, (2) hľadá chýbajúce
// e-maily, (3) odôvodnene posúdi leady (vhodné ostanú, nevhodné sa skryjú s dôvodom), (4) ak je
// zásoba pre Noru nízka, oskenuje ďalší segment po segmente (kraje sa striedajú). Všetko je pod
// rozpočtom, každé rozhodnutie sa zapisuje (agent_notes) a nič sa neodosiela.
import { prisma } from "@/lib/prisma";
import { AGENTS_START, canRunAutonomously, withSpend } from "./budget";
import { applyVerdicts, assessLeads, ARCHIVE_PREFIX, RETRY_REASON_RE, VERDICT_VERSION, type AssessLead, type Verdict } from "./assess";
import { latestVerdicts, listNotes, notesAvailable, writeNote } from "./notes";
import { getShortlist, PRIORITY_KEYWORDS } from "./skaut";
import { QUALIFY_AT } from "@/lib/leads/qualification";
import { enrichLead, scanSegment } from "@/lib/leads/scanner";
import { findEmailForLead } from "@/lib/leads/email-finder";

/** Zásoba vhodných leadov pre Noru, pod ktorou Miro skenuje ďalej (nad ňou šetrí rozpočet). */
export const POOL_TARGET = 60;
/** Najviac toľko skenov denne (jeden stojí ≈ 0,3 €). */
export const SCANS_PER_DAY = 2;
export const SCAN_EST_EUR = 0.35;
const MAX_ENRICH = 4;
const MAX_ASSESS = 16;
const MAX_EMAIL = 6;
/** Poradie odborov pri systematickom skenovaní. */
const NICHE_ORDER = ["realit", "stav", "fyzio"];

export interface ScoutResult {
  skipped?: string;
  log: string[];
  enriched: number;
  emailsFound: number;
  assessed: number;
  suitable: number;
  rejected: number;
  scan?: { segment: string; regions: string[]; found: number; qualified: number; suitable: number; sweepDone: boolean };
}

const priorityWhere = () => ({
  segment: { is: { OR: PRIORITY_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) } },
});

const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d < AGENTS_START ? AGENTS_START : d;
};

/** Odbor segmentu (0 realitné, 1 stavebné, 2 fyzio) pre poradie skenovania. */
const nicheIndex = (name: string) => {
  const n = name.toLowerCase();
  const i = NICHE_ORDER.findIndex((k) => n.includes(k));
  return i < 0 ? 9 : i;
};

/** Ďalší segment na sken: rozpracovaný (kraje sa postupne prechádzajú) má prednosť, inak najmenej obídený, potom podľa poradia odborov. */
export async function chooseSegment(): Promise<{ id: string; name: string; scanOffset: number; sweeps: number } | null> {
  const segs = await prisma.leadSegment.findMany({ where: { OR: PRIORITY_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) } });
  const usable = segs.filter((s) => s.keywords.length > 0);
  // nový systém preferuje segmenty "SK+CZ", staré len ak pre odbor nič iné nie je
  const modern = usable.filter((s) => /SK\+CZ/i.test(s.name));
  const niches = new Set(modern.map((s) => nicheIndex(s.name)));
  const list = [...modern, ...usable.filter((s) => !/SK\+CZ/i.test(s.name) && !niches.has(nicheIndex(s.name)))];
  if (!list.length) return null;
  const sweepNotes = await listNotes({ kind: "sweep", since: AGENTS_START }, 200);
  const sweeps = new Map<string, number>();
  for (const n of sweepNotes) {
    const id = (n.data as { segmentId?: string } | null)?.segmentId;
    if (id) sweeps.set(id, (sweeps.get(id) ?? 0) + 1);
  }
  const ranked = list
    .map((s) => ({ id: s.id, name: s.name, scanOffset: s.scanOffset, sweeps: sweeps.get(s.id) ?? 0 }))
    .sort((a, b) => (b.scanOffset > 0 ? 1 : 0) - (a.scanOffset > 0 ? 1 : 0) || a.sweeps - b.sweeps || nicheIndex(a.name) - nicheIndex(b.name));
  return ranked[0];
}

/** Jeden cyklus Skauta. Volá ho cron; každý krok hlási do logu. */
export async function runScoutCycle(deadlineAt: number, opts: { dry?: boolean } = {}): Promise<ScoutResult> {
  const res: ScoutResult = { log: [], enriched: 0, emailsFound: 0, assessed: 0, suitable: 0, rejected: 0 };
  if (opts.dry) return dryCycle(res);
  if (process.env.AGENT_SCOUT_DISABLED === "1") return { ...res, skipped: "Skenovanie je vypnuté (AGENT_SCOUT_DISABLED)." };
  if (!(await notesAvailable())) return { ...res, skipped: "Chýba tabuľka agent_notes (spusti SQL z postupu)." };
  const gate = await canRunAutonomously("skaut", 0.15);
  if (!gate.ok) return { ...res, skipped: gate.reason };

  await withSpend({ agent: "skaut" }, async () => {
    const left = () => deadlineAt - Date.now();

    // 1) analýza neanalyzovaných prioritných leadov (nové aj archivované pri čistom štarte)
    const unanalysed = await prisma.lead.findMany({
      where: {
        ...priorityWhere(),
        websiteUrl: { not: null },
        websiteScore: null,
        OR: [{ status: "new" }, { status: "rejected", disqualifyReason: { startsWith: ARCHIVE_PREFIX } }],
      },
      orderBy: [{ companyEmail: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: MAX_ENRICH,
      include: { segment: true },
    });
    for (const l of unanalysed) {
      if (left() < 120_000 || !l.segment) break;
      // archivovaný lead sa pri analýze vráti do hry (o osude rozhodne posúdenie)
      if (l.status === "rejected") await prisma.lead.update({ where: { id: l.id }, data: { status: "new", disqualifyReason: null } }).catch(() => {});
      await enrichLead(l.id, l.segment).catch(() => null);
      res.enriched++;
    }
    if (res.enriched) res.log.push(`Analyzoval som ${res.enriched} webov.`);

    await assessAndFindEmails(res, left);

    // 2) systematický sken: ďalší segment, ak je zásoba pre Noru nízka
    const pool = await getShortlist(1).then((r) => r.candidates).catch(() => 0);
    const scansToday = (await listNotes({ kind: "scan", since: dayStart() }, 20)).length;
    if (pool >= POOL_TARGET) {
      res.log.push(`Zásoba pre Noru je dostatočná (${pool}), nový sken nerobím.`);
    } else if (scansToday >= SCANS_PER_DAY) {
      res.log.push(`Dnešný limit skenov (${SCANS_PER_DAY}) je vyčerpaný.`);
    } else if (left() < 200_000) {
      res.log.push("Na ďalší sken nezostáva čas.");
    } else if (await prisma.leadScanJob.findFirst({ where: { status: "running", createdAt: { gt: new Date(Date.now() - 20 * 60_000) } }, select: { id: true } })) {
      res.log.push("Práve beží iný sken, počkám.");
    } else {
      const g = await canRunAutonomously("skaut", SCAN_EST_EUR);
      if (!g.ok) res.log.push(`Sken preskočený: ${g.reason}`);
      else await scanOnce(res, left);
    }
  });
  return res;
}

/** Skúška bez zásahu: len spočíta, čo by cyklus urobil (žiadne zápisy, žiadne volania AI ani Google). */
async function dryCycle(res: ScoutResult): Promise<ScoutResult> {
  const [unanalysed, noMail, toAssess, pool, seg, notes] = await Promise.all([
    prisma.lead.count({ where: { ...priorityWhere(), websiteUrl: { not: null }, websiteScore: null, OR: [{ status: "new" }, { status: "rejected", disqualifyReason: { startsWith: ARCHIVE_PREFIX } }] } }),
    prisma.lead.count({ where: { ...priorityWhere(), status: "new", websiteUrl: { not: null }, websiteScore: { gte: QUALIFY_AT }, OR: [{ companyEmail: null }, { companyEmail: "" }] } }),
    prisma.lead.count({ where: { ...priorityWhere(), websiteUrl: { not: null }, websiteScore: { not: null }, OR: [{ status: "new" }, { status: "rejected", disqualifyReason: { startsWith: ARCHIVE_PREFIX } }] } }),
    getShortlist(1).then((r) => r.candidates).catch(() => -1),
    chooseSegment().catch(() => null),
    notesAvailable(),
  ]);
  res.log.push(`Tabuľka agent_notes: ${notes ? "existuje" : "CHÝBA"}.`);
  res.log.push(`Na analýzu čaká ${unanalysed} leadov, bez e-mailu ${noMail}, na posúdenie ${toAssess}.`);
  res.log.push(`Zásoba pre Noru: ${pool}. Ďalší sken: ${seg ? `${seg.name} (rozpracované kraje od ${seg.scanOffset}, kolo ${seg.sweeps + 1})` : "žiadny segment"}.`);
  return res;
}

/** Posúdi leady bez verdiktu a doplní chýbajúce e-maily vhodným. */
async function assessAndFindEmails(res: ScoutResult, left: () => number, onlySegmentId?: string): Promise<void> {
  // e-maily: analyzované, kvalifikované leady bez e-mailu (najviac MAX_EMAIL, každý najviac raz za 14 dní)
  const noMail = await prisma.lead.findMany({
    where: {
      ...priorityWhere(),
      ...(onlySegmentId ? { segmentId: onlySegmentId } : {}),
      status: "new",
      websiteUrl: { not: null },
      websiteScore: { gte: QUALIFY_AT },
      OR: [{ companyEmail: null }, { companyEmail: "" }],
    },
    orderBy: { websiteScore: "desc" },
    take: 25,
    select: { id: true, websiteUrl: true, companyName: true },
  });
  if (noMail.length) {
    const recent = await listNotes({ kind: "email-search", leadIds: noMail.map((l) => l.id), since: new Date(Date.now() - 14 * 86_400_000) }, 100);
    const tried = new Set(recent.map((n) => n.leadId));
    let n = 0;
    for (const l of noMail) {
      if (n >= MAX_EMAIL || left() < 90_000) break;
      if (tried.has(l.id)) continue;
      n++;
      const email = await findEmailForLead(l.websiteUrl, l.companyName).catch(() => null);
      if (email) {
        await prisma.lead.update({ where: { id: l.id }, data: { companyEmail: email } }).catch(() => {});
        res.emailsFound++;
      }
      await writeNote({ agent: "miro", kind: "email-search", leadId: l.id, title: email ? `Našiel e-mail: ${l.companyName}` : `E-mail sa nenašiel: ${l.companyName}` });
    }
    if (res.emailsFound) res.log.push(`Našiel som ${res.emailsFound} e-mailov.`);
  }

  // posúdenie: analyzované leady bez verdiktu (nové aj archivované)
  const candidates = await prisma.lead.findMany({
    where: {
      ...priorityWhere(),
      ...(onlySegmentId ? { segmentId: onlySegmentId } : {}),
      websiteUrl: { not: null },
      websiteScore: { not: null },
      OR: [
        { status: "new" },
        { status: "rejected", disqualifyReason: { startsWith: ARCHIVE_PREFIX } },
        // skoršie posúdenie vyradilo firmu pre chýbajúci e-mail (chyba pravidiel v1): posúdi sa znova
        { status: "rejected", disqualifyReason: { startsWith: "Miro:" } },
      ],
    },
    orderBy: [{ websiteScore: "desc" }],
    take: 120,
    include: { segment: { select: { name: true } } },
  });
  const done = await latestVerdicts(candidates.map((l) => l.id));
  const stale = (l: AssessLead) => {
    const v = done.get(l.id)?.data as Verdict | undefined;
    return l.status === "rejected" && (l.disqualifyReason ?? "").startsWith("Miro:") && RETRY_REASON_RE.test(l.disqualifyReason ?? "") && (v?.v ?? 1) < VERDICT_VERSION;
  };
  const todo = (candidates as AssessLead[])
    .filter((l) => (l.status === "rejected" && (l.disqualifyReason ?? "").startsWith("Miro:") ? stale(l) : !done.has(l.id)))
    .slice(0, MAX_ASSESS);
  if (!todo.length || left() < 60_000) return;
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const verdicts = await assessLeads(batch, "sken");
    const r = await applyVerdicts(batch, verdicts);
    res.assessed += verdicts.size;
    res.suitable += r.suitable;
    res.rejected += r.rejected;
  }
  res.log.push(`Posúdil som ${res.assessed} leadov: ${res.suitable} vhodných, ${res.rejected} skrytých s dôvodom.`);
}

async function scanOnce(res: ScoutResult, left: () => number): Promise<void> {
  const seg = await chooseSegment();
  if (!seg) {
    res.log.push("Nenašiel som segment na sken (chýbajú kľúčové slová).");
    return;
  }
  const started = new Date();
  const s = await scanSegment(seg.id, { maxDiscover: 12, region: "both" });
  const after = await prisma.leadSegment.findUnique({ where: { id: seg.id }, select: { scanOffset: true } });
  const job = s.jobId ? await prisma.leadScanJob.findUnique({ where: { id: s.jobId }, select: { regions: true } }) : null;
  const sweepDone = (after?.scanOffset ?? 1) === 0;
  if (sweepDone) await writeNote({ agent: "miro", kind: "sweep", title: `Prešiel som všetky kraje: ${seg.name}`, data: { segmentId: seg.id, segment: seg.name, sweep: seg.sweeps + 1 } });

  // novo nájdené leady hneď posúdi (len z tohto segmentu)
  const before = res.suitable;
  const beforeRej = res.rejected;
  await assessAndFindEmails(res, left, seg.id);
  const spend = await prisma.agentSpend.aggregate({ where: { agent: "skaut", createdAt: { gte: started } }, _sum: { eur: true } }).catch(() => ({ _sum: { eur: 0 } }));
  const summary = {
    segmentId: seg.id,
    segment: seg.name,
    regions: job?.regions ?? [],
    found: s.foundTotal,
    qualified: s.foundQualified,
    suitable: res.suitable - before,
    rejectedByMiro: res.rejected - beforeRej,
    sweepDone,
    costEur: Math.round((spend._sum.eur ?? 0) * 1000) / 1000,
    error: s.error ?? null,
  };
  await writeNote({
    agent: "miro",
    kind: "scan",
    title: `Sken ${seg.name}: ${s.foundTotal} firiem, ${summary.suitable} vhodných`,
    body: `Kraje: ${summary.regions.join(", ") || "?"}`,
    data: summary,
  });
  res.scan = { segment: seg.name, regions: summary.regions, found: s.foundTotal, qualified: s.foundQualified, suitable: summary.suitable, sweepDone };
  res.log.push(`Sken ${seg.name} (${summary.regions.join(", ")}): ${s.foundTotal} firiem, ${summary.suitable} vhodných${s.error ? `, chyba: ${s.error}` : ""}.`);
}

// ---------------------------------------------------------------------------------------------
// Prehľad pre človeka: lievik a postup po segmentoch

export interface FunnelSegment {
  id: string;
  name: string;
  sweeps: number;
  progress: number;
  scans: number;
  found: number;
  suitable: number;
  lastScanAt: string | null;
  focus: boolean;
}

export interface Funnel {
  days: number;
  scans: number;
  found: number;
  assessed: number;
  suitable: number;
  rejected: number;
  pool: number;
  researched: number;
  sent: number;
  lastCycleAt: string | null;
  scansToday: number;
  segments: FunnelSegment[];
  available: boolean;
}

export async function scoutFunnel(days = 7): Promise<Funnel> {
  const since = new Date(Math.max(Date.now() - days * 86_400_000, AGENTS_START.getTime()));
  const empty: Funnel = { days, scans: 0, found: 0, assessed: 0, suitable: 0, rejected: 0, pool: 0, researched: 0, sent: 0, lastCycleAt: null, scansToday: 0, segments: [], available: false };
  if (!(await notesAvailable())) return empty;
  try {
    const [scanNotes, verdictNotes, sweepNotes, segs, pool, researched, sent, focus] = await Promise.all([
      listNotes({ kind: "scan", since }, 300),
      listNotes({ kind: "verdict", since }, 1000),
      listNotes({ kind: "sweep", since: AGENTS_START }, 200),
      prisma.leadSegment.findMany({ where: { OR: PRIORITY_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) }, select: { id: true, name: true, scanOffset: true, keywords: true } }),
      getShortlist(1).then((r) => r.candidates).catch(() => 0),
      prisma.leadResearch.count({ where: { status: "done", createdAt: { gte: since } } }).catch(() => 0),
      prisma.leadEmail.count({ where: { status: "sent", sentAt: { gte: since } } }).catch(() => 0),
      chooseSegment().catch(() => null),
    ]);
    const per = new Map<string, { scans: number; found: number; suitable: number; last: Date | null }>();
    let found = 0;
    for (const n of scanNotes) {
      const d = (n.data ?? {}) as { segmentId?: string; found?: number; suitable?: number };
      found += d.found ?? 0;
      if (!d.segmentId) continue;
      const p = per.get(d.segmentId) ?? { scans: 0, found: 0, suitable: 0, last: null };
      p.scans++;
      p.found += d.found ?? 0;
      p.suitable += d.suitable ?? 0;
      if (!p.last || n.createdAt > p.last) p.last = n.createdAt;
      per.set(d.segmentId, p);
    }
    const sweeps = new Map<string, number>();
    for (const n of sweepNotes) {
      const id = (n.data as { segmentId?: string } | null)?.segmentId;
      if (id) sweeps.set(id, (sweeps.get(id) ?? 0) + 1);
    }
    const suitable = verdictNotes.filter((n) => (n.data as { suitable?: boolean } | null)?.suitable).length;
    const modern = segs.filter((s) => s.keywords.length > 0);
    const list = modern.filter((s) => /SK\+CZ/i.test(s.name) || !modern.some((o) => /SK\+CZ/i.test(o.name) && nicheIndex(o.name) === nicheIndex(s.name)));
    const windows = 8; // 22 krajov po 3 = 8 okien
    const segments: FunnelSegment[] = list
      .map((s) => {
        const p = per.get(s.id);
        return {
          id: s.id,
          name: s.name,
          sweeps: sweeps.get(s.id) ?? 0,
          progress: Math.min(1, Math.round((s.scanOffset / 3 / windows) * 100) / 100),
          scans: p?.scans ?? 0,
          found: p?.found ?? 0,
          suitable: p?.suitable ?? 0,
          lastScanAt: p?.last?.toISOString() ?? null,
          focus: focus?.id === s.id,
        };
      })
      .sort((a, b) => nicheIndex(a.name) - nicheIndex(b.name));
    const lastCycle = scanNotes[0]?.createdAt ?? verdictNotes[0]?.createdAt ?? null;
    return {
      days,
      scans: scanNotes.length,
      found,
      assessed: verdictNotes.length,
      suitable,
      rejected: verdictNotes.length - suitable,
      pool,
      researched,
      sent,
      lastCycleAt: lastCycle ? lastCycle.toISOString() : null,
      scansToday: scanNotes.filter((n) => n.createdAt >= dayStart()).length,
      segments,
      available: true,
    };
  } catch {
    return empty;
  }
}

