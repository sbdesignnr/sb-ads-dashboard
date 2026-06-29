import { getCampaignsWithFallback, getKeywordMetrics } from "@/lib/google-ads/campaigns";
import {
  getAdsMetrics,
  getGeoTargets,
  getConversionActions,
  getAdSchedules,
  getChangeHistory,
} from "@/lib/google-ads/account-insights";
import { computeTotals } from "@/lib/utils/metrics";
import { statusLabel, typeLabel } from "@/lib/utils/formatters";
import { allCampaigns } from "@/lib/mock-data";
import type { Campaign } from "@/lib/types";
import type { DataSource } from "@/lib/google-ads/types";

export interface LiveContext {
  text: string;
  source: DataSource;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);

// A couple of common Slovak geo-target constant ids for readability.
const GEO_NAMES: Record<string, string> = {
  "2703": "Slovensko",
  "9069525": "Bratislavský kraj",
  "1000420": "Nitriansky kraj",
};
const geoLabel = (id: string) => (GEO_NAMES[id] ? `${GEO_NAMES[id]} (${id})` : id || "—");

function campaignLines(campaigns: Campaign[]): string {
  if (!campaigns.length) return "(žiadne kampane)";
  return campaigns
    .map((c) => {
      const t = computeTotals(c.daily.slice(-30));
      return `- "${c.name}" | status: ${statusLabel(c.status)} | typ: ${typeLabel(c.type)} | denný rozpočet: ${r0(c.dailyBudget)} € | 30 dní → výdavky ${r2(t.spend)} €, zobrazenia ${r0(t.impressions)}, kliky ${r0(t.clicks)}, CTR ${r2(t.ctr)} %, CPC ${r2(t.cpc)} €, konverzie ${r0(t.conversions)}, tržby ${r2(t.revenue)} €, ROAS ${r2(t.roas)}×`;
    })
    .join("\n");
}

const memo: { ts: number; ctx: LiveContext } = { ts: 0, ctx: { text: "", source: "mock" } };
const TTL = 60_000;

/**
 * Builds a real-time campaign context block injected into the AI system prompt.
 * Uses live Google Ads data when connected (campaigns, keywords, ads, geo,
 * conversions); otherwise a rich mock summary. Memoized for 60s.
 */
export async function buildLiveCampaignContext(): Promise<LiveContext> {
  if (memo.ts && Date.now() - memo.ts < TTL) return memo.ctx;

  const { campaigns: liveCampaigns, source } = await getCampaignsWithFallback();
  const isLive = source === "google-ads";
  const campaigns = isLive ? liveCampaigns : allCampaigns;

  const account = computeTotals(campaigns.flatMap((c) => c.daily.slice(-30)));

  const parts: string[] = [];
  parts.push(
    isLive
      ? "ZDROJ DÁT: Naživo z Google Ads API (reálne dáta účtu)."
      : "ZDROJ DÁT: Demo dáta (Google Ads účet nie je momentálne pripojený).",
  );
  parts.push("OBDOBIE: posledných 30 dní.\n");

  parts.push(
    `CELKOVÉ METRIKY ÚČTU:\nvýdavky ${r2(account.spend)} €, tržby ${r2(account.revenue)} €, ROAS ${r2(account.roas)}×, zobrazenia ${r0(account.impressions)}, kliky ${r0(account.clicks)}, CTR ${r2(account.ctr)} %, CPC ${r2(account.cpc)} €, konverzie ${r0(account.conversions)}, konverzný pomer ${r2(account.conversionRate)} %.\n`,
  );

  parts.push(`KAMPANE:\n${campaignLines(campaigns)}`);

  if (isLive) {
    const [kw, ads, geo, conv, sched, changes] = await Promise.allSettled([
      getKeywordMetrics(),
      getAdsMetrics(),
      getGeoTargets(),
      getConversionActions(),
      getAdSchedules(),
      getChangeHistory(),
    ]);

    const keywords = kw.status === "fulfilled" ? kw.value : [];
    parts.push(
      `\nKĽÚČOVÉ SLOVÁ (top podľa výdavkov):\n${
        keywords.length
          ? keywords
              .slice(0, 25)
              .map(
                (k) =>
                  `- "${k.keyword}" [${k.matchType}] | zobrazenia ${r0(k.impressions)}, kliky ${r0(k.clicks)}, CTR ${r2(k.ctr)} %, CPC ${r2(k.avgCpc)} €, konverzie ${r0(k.conversions)}, výdavky ${r2(k.cost)} €`,
              )
              .join("\n")
          : "(žiadne kľúčové slová)"
      }`,
    );

    const adsList = ads.status === "fulfilled" ? ads.value : [];
    parts.push(
      `\nREKLAMY (top podľa zobrazení):\n${
        adsList.length
          ? adsList
              .slice(0, 15)
              .map(
                (a) =>
                  `- "${a.campaign}" / "${a.adGroup}" reklama ${a.adId} | status: ${a.status} | zobrazenia ${r0(a.impressions)}, kliky ${r0(a.clicks)}, CTR ${r2(a.ctr)} %, konverzie ${r0(a.conversions)}`,
              )
              .join("\n")
          : "(žiadne reklamy)"
      }`,
    );

    const geoList = geo.status === "fulfilled" ? geo.value : [];
    parts.push(
      `\nGEO CIELENIE:\n${
        geoList.length
          ? geoList
              .slice(0, 20)
              .map((g) => `- "${g.campaign}": ${geoLabel(g.geo)}${g.negative ? " (vylúčené)" : ""}`)
              .join("\n")
          : "(žiadne geo kritériá)"
      }`,
    );

    const convList = conv.status === "fulfilled" ? conv.value : [];
    parts.push(
      `\nKONVERZNÉ AKCIE (tracking):\n${
        convList.length
          ? convList.slice(0, 20).map((c) => `- ${c.name} | status: ${c.status}`).join("\n")
          : "(žiadne konverzné akcie / tracking nenastavený)"
      }`,
    );

    const schedList = sched.status === "fulfilled" ? sched.value : [];
    parts.push(
      `\nAD SCHEDULE (časový plán reklám):\n${
        schedList.length
          ? schedList
              .slice(0, 20)
              .map((s) => `- "${s.campaign}": ${s.day} ${s.startHour}:00–${s.endHour}:00`)
              .join("\n")
          : "(žiadny vlastný plán — reklamy bežia nepretržite 24/7)"
      }`,
    );

    const changeList = changes.status === "fulfilled" ? changes.value : [];
    const earliestChange = changeList.length ? changeList[changeList.length - 1].dateTime : "";
    parts.push(
      `\nAKTIVITA KAMPANE:\nPresný dátum spustenia Google Ads API pri aktuálnom prístupe nevracia (pole campaign.start_date nie je dostupné).${
        earliestChange ? ` Najstaršia zaznamenaná zmena v okne 14 dní: ${earliestChange}.` : ""
      }`,
    );
    parts.push(
      `\nHISTÓRIA ZMIEN (posledných 14 dní):\n${
        changeList.length
          ? changeList
              .slice(0, 15)
              .map(
                (c) =>
                  `- ${c.dateTime}${c.user ? ` · ${c.user}` : ""}${c.resourceType ? ` · ${c.resourceType}` : ""}`,
              )
              .join("\n")
          : "(žiadne nedávne zmeny)"
      }`,
    );
  }

  const ctx: LiveContext = { text: parts.join("\n"), source };
  memo.ts = Date.now();
  memo.ctx = ctx;
  return ctx;
}
