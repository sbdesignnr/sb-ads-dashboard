// Živý stav agentov — počíta sa z REÁLNYCH dát v databáze, nič sa nehrá.
// Pridanie ďalšieho agenta: napíš provider (vráti AgentSnapshot) a zaregistruj ho nižšie.
import { prisma } from "@/lib/prisma";
import { QUALIFY_AT } from "@/lib/leads/qualification";
import { getBudget, SOFT_STOP } from "./budget";
import { backlogCount, getShortlist } from "./skaut";
import {
  AGENTS,
  type AgentEvent,
  type AgentSnapshot,
  type AgentSnapshots,
  type AgentStat,
  type AgentStatus,
} from "./registry";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Signály z behov výskumného agenta. Ak tabuľka ešte neexistuje, vráti nuly (Nora ostane funkčná). */
async function researchSignals() {
  try {
    const cutoff = new Date(Date.now() - 8 * MIN);
    const [running, ready, recent, mockupRunning] = await Promise.all([
      prisma.leadResearch.findFirst({
        where: { status: "running", updatedAt: { gt: cutoff } },
        orderBy: { createdAt: "desc" },
        select: { step: true, lead: { select: { companyName: true } } },
      }),
      prisma.leadResearch.count({
        where: { status: "done", appliedAt: null, emailBody: { not: null } },
      }),
      prisma.leadResearch.findMany({
        where: { createdAt: { gt: new Date(Date.now() - 3 * 24 * HOUR) } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          status: true,
          offerName: true,
          updatedAt: true,
          appliedAt: true,
          lead: { select: { companyName: true } },
        },
      }),
      prisma.leadMockup
        .findFirst({
          where: { status: "running", updatedAt: { gt: cutoff } },
          orderBy: { createdAt: "desc" },
          select: { step: true, lead: { select: { companyName: true } } },
        })
        .catch(() => null),
    ]);
    return { running, ready, recent, mockupRunning, ok: true as const };
  } catch {
    return { running: null, ready: 0, recent: [], mockupRunning: null, ok: false as const };
  }
}

/**
 * Nora pripravuje ponuky (výskum) a stráži koncepty mailov na schválenie:
 *  - pracuje: beží jej výskum, alebo sa práve píšu koncepty,
 *  - čaká: hotové ponuky alebo koncepty čakajú na tvoje posúdenie,
 *  - inak nečinná.
 */
async function noraSnapshot(): Promise<AgentSnapshot> {
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms);

  const [
    draftedNow,
    draftsWaiting,
    approved,
    qualified,
    sent24h,
    sentWeek,
    repliesWeek,
    openedWeek,
    recentMails,
    research,
  ] = await Promise.all([
    prisma.leadEmail.count({ where: { createdAt: { gt: since(2 * MIN) } } }),
    prisma.leadEmail.count({
      where: {
        status: "draft",
        OR: [
          {
            emailType: "initial",
            lead: { status: "new", websiteScore: { gte: QUALIFY_AT } },
          },
          { emailType: { not: "initial" } },
        ],
      },
    }),
    prisma.leadEmail.count({ where: { status: "approved" } }),
    prisma.lead.count({ where: { status: "new", websiteScore: { gte: QUALIFY_AT } } }),
    prisma.leadEmail.count({ where: { status: "sent", sentAt: { gt: since(24 * HOUR) } } }),
    prisma.leadEmail.count({ where: { status: "sent", sentAt: { gt: since(7 * 24 * HOUR) } } }),
    prisma.leadEmail.count({ where: { repliedAt: { gt: since(7 * 24 * HOUR) } } }),
    prisma.leadEmail.count({ where: { openedAt: { gt: since(7 * 24 * HOUR) } } }),
    prisma.leadEmail.findMany({
      where: { updatedAt: { gt: since(3 * 24 * HOUR) } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        createdAt: true,
        sentAt: true,
        repliedAt: true,
        openedAt: true,
        status: true,
        emailType: true,
        lead: { select: { companyName: true } },
      },
    }),
    researchSignals(),
  ]);

  const researchRunning = research.running ? 1 : 0;
  const researchReady = research.ready;
  // Koncept, ktorý vznikol kliknutím na "Použiť ako koncept", nie je práca na pozadí.
  const appliedJustNow = research.recent.filter(
    (r) => r.appliedAt && r.appliedAt.getTime() > now - 2 * MIN,
  ).length;
  const drafting = draftedNow > appliedJustNow ? 1 : 0;

  let status: AgentStatus = "idle";
  let headline = "Všetko hotové, čaká na ďalší lead.";
  let detail: string | undefined;
  if (researchRunning) {
    status = "working";
    headline = `Pripravuje ponuku pre ${research.running?.lead.companyName ?? "lead"}.`;
    detail = research.running?.step ?? undefined;
  } else if (research.mockupRunning) {
    status = "working";
    headline = `Ateliér navrhuje domovskú stránku pre ${research.mockupRunning.lead.companyName}.`;
    detail = research.mockupRunning.step ?? undefined;
  } else if (drafting) {
    status = "working";
    headline = "Píše koncepty mailov.";
  } else if (researchReady > 0 || draftsWaiting > 0) {
    status = "waiting";
    headline =
      researchReady > 0
        ? `${researchReady} ${researchReady === 1 ? "ponuka je hotová" : "ponúk je hotových"} na tvoje posúdenie` +
          (draftsWaiting > 0 ? `, ${draftsWaiting} konceptov čaká na schválenie.` : ".")
        : `${draftsWaiting} konceptov čaká na tvoje schválenie.`;
  } else if (qualified > 0) {
    headline = `Vo fronte je ${qualified} vhodných leadov, čaká na pokyn.`;
  }

  const stats: AgentStat[] = [
    { label: "Ponuky na posúdenie", value: String(researchReady), hint: "výskum s mailom" },
    { label: "Koncepty na schválenie", value: String(draftsWaiting), hint: "koncepty mailov" },
    { label: "Vhodné leady", value: String(qualified), hint: "neoslovené" },
    { label: "Odoslané / 24 h", value: String(sent24h) },
    { label: "Odoslané / 7 dní", value: String(sentWeek) },
    { label: "Odpovede / 7 dní", value: String(repliesWeek) },
  ];

  // Časová os z reálnych záznamov (najnovšie hore).
  const events: (AgentEvent & { t: number })[] = [];
  const push = (d: Date | null, text: string, tone: AgentEvent["tone"]) => {
    if (d) events.push({ at: d.toISOString(), text, tone, t: d.getTime() });
  };
  for (const m of recentMails) {
    const co = m.lead.companyName;
    push(m.repliedAt, `Odpoveď od ${co}`, "ok");
    push(m.sentAt, `Odoslaný mail: ${co}`, "info");
    if (m.status === "draft") push(m.createdAt, `Pripravený koncept: ${co}`, "warn");
  }
  for (const r of research.recent) {
    const co = r.lead.companyName;
    if (r.status === "done") push(r.updatedAt, `Ponuka pripravená: ${co}${r.offerName ? ` (${r.offerName})` : ""}`, "ok");
    if (r.status === "failed") push(r.updatedAt, `Výskum sa nepodaril: ${co}`, "warn");
    if (r.appliedAt) push(r.appliedAt, `Mail z výskumu použitý ako koncept: ${co}`, "info");
  }
  events.sort((a, b) => b.t - a.t);
  const activity = events.slice(0, 8).map(({ at, text, tone }) => ({ at, text, tone }));

  return {
    status,
    headline,
    detail,
    counters: {
      researchRunning,
      researchReady,
      drafting,
      draftsWaiting,
      approved,
      qualified,
      sent24h,
      sentWeek,
      repliesWeek,
      openedWeek,
    },
    stats,
    activity,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Miro (Skaut) hľadá a hodnotí firmy: pracuje, keď beží sken alebo sa práve hodnotia weby;
 * čaká, keď je vyčerpaný mesačný rozpočet; inak nečinný a ukazuje zásobu a výber pre Noru.
 */
async function miroSnapshot(): Promise<AgentSnapshot> {
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms);
  const [scanRunning, lastFailedScan, analysedNow, analysedWeek, recentScans, shortlist, backlog, budget, noraWeek] =
    await Promise.all([
      prisma.leadScanJob.findFirst({
        where: { status: "running", createdAt: { gt: since(20 * MIN) } },
        orderBy: { createdAt: "desc" },
        select: { foundTotal: true, segment: { select: { name: true } } },
      }),
      prisma.leadScanJob.findFirst({
        where: { status: "failed", createdAt: { gt: since(30 * MIN) } },
        orderBy: { createdAt: "desc" },
        select: { errorMessage: true },
      }),
      prisma.lead.count({ where: { lastScannedAt: { gt: since(2 * MIN) } } }),
      prisma.lead.count({ where: { lastScannedAt: { gt: since(7 * 24 * HOUR) } } }),
      prisma.leadScanJob.findMany({
        where: { createdAt: { gt: since(7 * 24 * HOUR) } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          status: true,
          foundTotal: true,
          foundQualified: true,
          completedAt: true,
          createdAt: true,
          segment: { select: { name: true } },
        },
      }),
      getShortlist(5).catch(() => ({ picks: [], candidates: 0 })),
      backlogCount().catch(() => 0),
      getBudget(),
      prisma.leadResearch.count({ where: { createdAt: { gt: since(7 * 24 * HOUR) } } }).catch(() => 0),
    ]);

  const scanning = scanRunning ? 1 : 0;
  const analysing = analysedNow > 0 ? 1 : 0;
  const budgetTight = budget.available && budget.pctUsed >= SOFT_STOP;

  let status: AgentStatus = "idle";
  let headline = `Zásoba: ${backlog} vhodných leadov v prioritných odboroch, ${shortlist.candidates} čaká na Noru.`;
  if (lastFailedScan && !scanning) {
    status = "error";
    headline = `Posledný sken zlyhal${lastFailedScan.errorMessage ? `: ${lastFailedScan.errorMessage.slice(0, 90)}` : "."}`;
  } else if (scanning) {
    status = "working";
    headline = `Skenuje segment ${scanRunning?.segment?.name ?? ""}`.trim() + ` (nájdených ${scanRunning?.foundTotal ?? 0})`;
  } else if (analysing) {
    status = "working";
    headline = `Hodnotí weby (posledné 2 minúty: ${analysedNow}).`;
  } else if (budgetTight) {
    status = "waiting";
    headline = `Rozpočet je vyčerpaný na ${Math.round(budget.pctUsed * 100)} %, čaká.`;
  }

  const events: (AgentEvent & { t: number })[] = [];
  for (const j of recentScans) {
    const seg = j.segment?.name ?? "segment";
    const d = j.completedAt ?? j.createdAt;
    if (j.status === "completed")
      events.push({ at: d.toISOString(), t: d.getTime(), text: `Sken ${seg}: ${j.foundTotal} webov, ${j.foundQualified} vhodných`, tone: "info" });
    if (j.status === "failed")
      events.push({ at: j.createdAt.toISOString(), t: j.createdAt.getTime(), text: `Sken ${seg} zlyhal`, tone: "warn" });
  }
  events.sort((a, b) => b.t - a.t);
  const activity: AgentEvent[] = [
    ...shortlist.picks.slice(0, 3).map((p) => ({
      at: new Date(now).toISOString(),
      text: `Top výber: ${p.lead.companyName} (skóre ${p.score}) — ${p.reasons.slice(0, 2).join(", ")}`,
      tone: "ok" as const,
    })),
    ...events.slice(0, 4).map(({ at, text, tone }) => ({ at, text, tone })),
  ];

  const stats: AgentStat[] = [
    { label: "Zásoba vhodných", value: String(backlog), hint: "prioritné odbory" },
    { label: "Čaká na Noru", value: String(shortlist.candidates) },
    { label: "Nora / 7 dní", value: String(noraWeek), hint: "spracované ponuky" },
    { label: "Hodnotených webov / 7 dní", value: String(analysedWeek) },
    { label: "Rozpočet spolu", value: `${budget.spentEur.toFixed(1).replace(".", ",")} €`, hint: `z ${budget.capEur} €` },
    { label: "Skaut tento mesiac", value: `${budget.byAgent.skaut.toFixed(2).replace(".", ",")} €` },
  ];

  return {
    status,
    headline,
    counters: {
      scanning,
      analysing,
      backlog,
      picks: shortlist.candidates,
      tableCount: shortlist.candidates,
      budgetPct: Math.round(budget.pctUsed * 100),
    },
    stats,
    activity,
    updatedAt: new Date().toISOString(),
  };
}

const STATUS_PROVIDERS: Record<string, () => Promise<AgentSnapshot>> = {
  nora: noraSnapshot,
  miro: miroSnapshot,
};

export async function getAgentSnapshots(): Promise<AgentSnapshots> {
  const out: AgentSnapshots = {};
  await Promise.all(
    AGENTS.map(async (a) => {
      const provider = STATUS_PROVIDERS[a.id];
      try {
        out[a.id] = provider
          ? await provider()
          : {
              status: "idle",
              headline: "Zatiaľ nemá napojený zdroj stavu.",
              counters: {},
              stats: [],
              activity: [],
              updatedAt: new Date().toISOString(),
            };
      } catch (e) {
        out[a.id] = {
          status: "error",
          headline: `Nepodarilo sa načítať stav: ${e instanceof Error ? e.message.slice(0, 80) : "neznáma chyba"}`,
          counters: {},
          stats: [],
          activity: [],
          updatedAt: new Date().toISOString(),
        };
      }
    }),
  );
  return out;
}
