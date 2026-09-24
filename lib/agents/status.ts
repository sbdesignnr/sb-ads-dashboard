// Živý stav agentov — počíta sa z REÁLNYCH dát v databáze, nič sa nehrá.
// Pridanie ďalšieho agenta: napíš provider (vráti AgentSnapshot) a zaregistruj ho nižšie.
import { prisma } from "@/lib/prisma";
import { QUALIFY_AT } from "@/lib/leads/qualification";
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

/**
 * Nora vlastní pipeline leadov (sken → analýza → ponuka → koncept mailu → odoslanie).
 * Stav sa odvodzuje z toho, čo sa práve deje v tabuľkách leadov a mailov:
 *  - pracuje: beží sken segmentu, alebo sa v poslednej chvíli analyzovali weby / písali koncepty,
 *  - čaká: existujú koncepty čakajúce na schválenie,
 *  - chyba: posledný sken zlyhal v uplynulej pol hodine,
 *  - inak nečinná.
 */
async function noraSnapshot(): Promise<AgentSnapshot> {
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms);

  const [
    scanRunning,
    lastFailedScan,
    analysedNow,
    draftedNow,
    draftsWaiting,
    approved,
    qualified,
    sent24h,
    sentWeek,
    repliesWeek,
    openedWeek,
    recentMails,
    recentScans,
  ] = await Promise.all([
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
    prisma.leadScanJob.findMany({
      where: { createdAt: { gt: since(3 * 24 * HOUR) } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        status: true,
        foundTotal: true,
        foundQualified: true,
        completedAt: true,
        createdAt: true,
        segment: { select: { name: true } },
      },
    }),
  ]);

  const scanning = scanRunning ? 1 : 0;
  const drafting = draftedNow > 0 ? 1 : 0;
  const analysing = analysedNow > 0 ? 1 : 0;

  let status: AgentStatus = "idle";
  let headline = "Všetko hotové, čaká na ďalší segment.";
  if (lastFailedScan && !scanning) {
    status = "error";
    headline = `Posledný sken zlyhal${lastFailedScan.errorMessage ? `: ${lastFailedScan.errorMessage.slice(0, 90)}` : "."}`;
  } else if (scanning) {
    status = "working";
    headline = `Skenuje segment ${scanRunning?.segment?.name ?? ""}`.trim() + ` (nájdených ${scanRunning?.foundTotal ?? 0})`;
  } else if (drafting) {
    status = "working";
    headline = "Píše koncepty mailov.";
  } else if (analysing) {
    status = "working";
    headline = `Analyzuje weby (posledné 2 minúty: ${analysedNow}).`;
  } else if (draftsWaiting > 0) {
    status = "waiting";
    headline = `${draftsWaiting} konceptov čaká na tvoje schválenie.`;
  } else if (qualified > 0) {
    headline = `Vo fronte je ${qualified} vhodných leadov, čaká na pokyn.`;
  }

  const stats: AgentStat[] = [
    { label: "Čaká na schválenie", value: String(draftsWaiting), hint: "koncepty mailov" },
    { label: "Vhodné leady", value: String(qualified), hint: "neoslovené" },
    { label: "Odoslané / 24 h", value: String(sent24h) },
    { label: "Odoslané / 7 dní", value: String(sentWeek) },
    { label: "Otvorené / 7 dní", value: String(openedWeek) },
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
  for (const j of recentScans) {
    const seg = j.segment?.name ?? "segment";
    if (j.status === "completed")
      push(j.completedAt ?? j.createdAt, `Sken ${seg}: ${j.foundTotal} webov, ${j.foundQualified} vhodných`, "info");
    if (j.status === "failed") push(j.createdAt, `Sken ${seg} zlyhal`, "warn");
  }
  events.sort((a, b) => b.t - a.t);
  const activity = events.slice(0, 8).map(({ at, text, tone }) => ({ at, text, tone }));

  return {
    status,
    headline,
    counters: {
      scanning,
      drafting,
      analysing,
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

const STATUS_PROVIDERS: Record<string, () => Promise<AgentSnapshot>> = {
  nora: noraSnapshot,
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
