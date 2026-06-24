import type { AIInsight, Campaign, Platform, Priority } from "@/lib/types";
import { computeTotals, deltaWoW } from "@/lib/utils/metrics";
import { formatCompactCurrency, formatRoas } from "@/lib/utils/formatters";
import { googleCampaigns } from "./google-ads";
import { metaCampaigns } from "./meta-ads";

export { googleCampaigns } from "./google-ads";
export { metaCampaigns } from "./meta-ads";
export { ANCHOR_DATE, HISTORY_DAYS } from "./_generator";

export const allCampaigns: Campaign[] = [...googleCampaigns, ...metaCampaigns];

export function getCampaignById(id: string): Campaign | undefined {
  return allCampaigns.find((c) => c.id === id);
}

export function getCampaignsByPlatform(platform: Platform): Campaign[] {
  return allCampaigns.filter((c) => c.platform === platform);
}

// ---------------------------------------------------------------------------
// Curated, account-level AI insights (reference real campaign ids).
// ---------------------------------------------------------------------------

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const accountInsights: AIInsight[] = [
  {
    id: "ins-competitor-waste",
    priority: "high",
    platform: "google",
    campaignId: "g-competitor",
    campaignName: "Search — Konkurenčné výrazy",
    category: "Bidding",
    title: "Konkurenčná kampaň míňa rozpočet s nízkou ROAS",
    problem:
      "Kampaň na konkurenčné výrazy má ROAS pod 1,5× a klesajúci trend. CPC vzrástlo o viac než 12 % a rozpočet je denne vyčerpaný bez návratnosti.",
    solution:
      "Pozastav najdrahšie konkurenčné kľúčové slová, zníž ponuky o 20–30 % a presmeruj uvoľnený rozpočet do kampane „Brand“ a „Shopping — Bestsellery“ s vysokou ROAS.",
    expectedImpact: "Úspora ~540 €/mesiac a +0,4× priemerná ROAS účtu",
    impactScore: 92,
  },
  {
    id: "ins-brand-scale",
    priority: "high",
    platform: "google",
    campaignId: "g-brand",
    campaignName: "Brand — Značkové výrazy",
    category: "Budget",
    title: "Brand kampaň naráža na rozpočtový strop",
    problem:
      "Brand kampaň má ROAS nad 10× a rastúci trend, no denný rozpočet 120 € obmedzuje zobrazenia v špičke. Strácaš lacné konverzie s najvyššou maržou.",
    solution:
      "Zvýš denný rozpočet o 40–60 % (na ~180 €). Brand dopyt je takmer zadarmo — neexistuje dôvod ho limitovať pri tejto návratnosti.",
    expectedImpact: "+18–24 konverzií/mesiac pri zachovaní ROAS > 9×",
    impactScore: 88,
  },
  {
    id: "ins-retarget-scale",
    priority: "high",
    platform: "meta",
    campaignId: "m-retarget",
    campaignName: "Conversion — Retargeting košík",
    category: "Budget",
    title: "Retargeting košíka škáluje — pridaj rozpočet",
    problem:
      "Retargeting opustených košíkov má najvyššiu ROAS spomedzi Meta kampaní a stabilný rast. Frekvencia 3,2 je ešte v zdravom pásme.",
    solution:
      "Navýš rozpočet o 25 % a rozšír okno retargetingu zo 14 na 21 dní. Sleduj frekvenciu — ak prekročí 4, pridaj 2–3 nové kreatívy.",
    expectedImpact: "+30 % tržieb z kampane pri ROAS okolo 5×",
    impactScore: 84,
  },
  {
    id: "ins-prospect-limited",
    priority: "medium",
    platform: "meta",
    campaignId: "m-prospect",
    campaignName: "Conversion — Prospecting nákupy",
    category: "Budget",
    title: "Prospecting je obmedzený rozpočtom pri priemernej ROAS",
    problem:
      "Konverzná prospecting kampaň je denne limitovaná rozpočtom, no jej ROAS je len mierne nad priemerom. Škálovanie bez optimalizácie by znížilo efektivitu.",
    solution:
      "Pred navýšením rozpočtu vylúč 2 najslabšie publiká a otestuj lookalike 1–3 % z nakupujúcich. Až potom postupne dvíhaj rozpočet po 15 %.",
    expectedImpact: "Stabilnejšia ROAS a priestor na bezpečné škálovanie",
    impactScore: 71,
  },
  {
    id: "ins-blog-cut",
    priority: "medium",
    platform: "meta",
    campaignId: "m-traffic-blog",
    campaignName: "Traffic — Blog a obsahový marketing",
    category: "Creative",
    title: "Blogová traffic kampaň má únavu publika",
    problem:
      "Frekvencia vzrástla na 2,8 a CTR aj konverzný pomer klesajú. Publikum videlo rovnaké kreatívy príliš veľakrát.",
    solution:
      "Obnov kreatívy (3–4 nové vizuály + video), zapni exclusion nakupujúcich a zníž rozpočet o 20 % dovtedy, kým sa CTR nevráti nad 1,1 %.",
    expectedImpact: "Návrat CTR nad 1,1 % a nižší CPC o ~15 %",
    impactScore: 64,
  },
  {
    id: "ins-prospecting-paused",
    priority: "medium",
    platform: "google",
    campaignId: "g-prospecting",
    campaignName: "Display — Prospecting nové publikum",
    category: "Structure",
    title: "Pozastavený Display prospecting — vyhodnoť reštart",
    problem:
      "Kampaň bola pozastavená pre nízku konverznosť (0,7 %). Display prospecting však plní hornú časť lievika a jeho vypnutie môže oslabiť remarketing.",
    solution:
      "Reštartuj s užším cielením (in-market + custom intent), vylúč nevýkonné umiestnenia a nastav cieľové CPA. Sleduj asistované konverzie, nie len last-click.",
    expectedImpact: "Doplnenie remarketingového publika o ~12 %",
    impactScore: 55,
  },
  {
    id: "ins-shopping-feed",
    priority: "medium",
    platform: "google",
    campaignId: "g-shopping-all",
    campaignName: "Shopping — Celý katalóg",
    category: "Structure",
    title: "Rozdeľ Shopping podľa marže produktov",
    problem:
      "Celý katalóg beží v jednej kampani s jednotnou ponukou. Produkty s vysokou maržou dostávajú rovnaké ponuky ako tie nízkomaržové.",
    solution:
      "Vytvor samostatnú kampaň pre top 20 % produktov podľa marže s vyššou cieľovou ROAS a zvyšok ponechaj v štandardnej kampani.",
    expectedImpact: "+8–12 % tržieb pri rovnakom rozpočte",
    impactScore: 61,
  },
  {
    id: "ins-newcollection-learning",
    priority: "low",
    platform: "google",
    campaignId: "g-newcollection",
    campaignName: "Search — Nová jarná kolekcia",
    category: "Bidding",
    title: "Nová kampaň je vo fáze učenia — nezasahuj",
    problem:
      "Kampaň „Nová jarná kolekcia“ zbiera dáta vo fáze učenia. Časté zmeny ponúk a rozpočtu reštartujú učenie a predlžujú stabilizáciu.",
    solution:
      "Počkaj na ~30 konverzií pred väčšími zmenami. Drž rozpočet stabilný a obmedz úpravy na max. raz za 5 dní.",
    expectedImpact: "Rýchlejšie ukončenie fázy učenia o ~1 týždeň",
    impactScore: 38,
  },
  {
    id: "ins-generic-negative",
    priority: "low",
    platform: "google",
    campaignId: "g-generic",
    campaignName: "Search — Generické kľúčové slová",
    category: "Keywords",
    title: "Pridaj vylučujúce kľúčové slová do generickej kampane",
    problem:
      "Generická search kampaň má stagnujúcu ROAS. Časť rozpočtu pravdepodobne padá na nerelevantné vyhľadávania (informačné dopyty bez nákupného zámeru).",
    solution:
      "Prejdi report vyhľadávacích výrazov za 30 dní a pridaj 15–25 vylučujúcich kľúčových slov (napr. „zadarmo“, „návod“, „recenzia“).",
    expectedImpact: "Úspora ~6–9 % rozpočtu a vyšší konverzný pomer",
    impactScore: 42,
  },
];

export function getSortedInsights(): AIInsight[] {
  return [...accountInsights].sort((a, b) => {
    const p = priorityRank[a.priority] - priorityRank[b.priority];
    if (p !== 0) return p;
    return b.impactScore - a.impactScore;
  });
}

export function getQuickWins(): AIInsight[] {
  return getSortedInsights()
    .filter((i) => i.priority === "high")
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Per-campaign insights (derived from the campaign's own metrics).
// ---------------------------------------------------------------------------

export function getInsightsForCampaign(campaign: Campaign): AIInsight[] {
  const totals = computeTotals(campaign.daily.slice(-30));
  const insights: AIInsight[] = [];
  const base = {
    platform: campaign.platform,
    campaignId: campaign.id,
    campaignName: campaign.name,
  };

  if (totals.roas < 2 && totals.spend > 0) {
    insights.push({
      ...base,
      id: `${campaign.id}-roas`,
      priority: "high",
      category: "Bidding",
      title: "Nízka návratnosť investície (ROAS)",
      problem: `ROAS kampane je ${formatRoas(totals.roas)}, čo je pod hranicou rentability. Časť rozpočtu sa míňa neefektívne.`,
      solution:
        "Prejdi na stratégiu Cieľová ROAS, zníž ponuky na drahé výrazy/publiká a vylúč najslabšie umiestnenia.",
      expectedImpact: "Zvýšenie ROAS o 0,5–1,0× do 3 týždňov",
      impactScore: 90,
    });
  }

  if (campaign.status === "limited") {
    insights.push({
      ...base,
      id: `${campaign.id}-budget`,
      priority: totals.roas >= 3 ? "high" : "medium",
      category: "Budget",
      title: "Kampaň je obmedzená rozpočtom",
      problem: `Denný rozpočet ${campaign.dailyBudget} € sa vyčerpáva a kampaň stráca potenciálne zobrazenia.`,
      solution:
        totals.roas >= 3
          ? "ROAS je zdravá — navýš rozpočet o 20–30 % a sleduj, či sa návratnosť udrží."
          : "Najprv zlepši efektivitu (cielenie, kreatívy), až potom postupne dvíhaj rozpočet.",
      expectedImpact: "Odomknutie ďalších konverzií bez straty efektivity",
      impactScore: 78,
    });
  }

  if (campaign.trend === "down") {
    insights.push({
      ...base,
      id: `${campaign.id}-trend`,
      priority: "medium",
      category: "Creative",
      title: "Klesajúci výkonnostný trend",
      problem:
        "Výkon kampane v čase klesá — pravdepodobná únava kreatív alebo zvyšujúca sa konkurencia v aukcii.",
      solution:
        "Obnov reklamné kreatívy, otestuj nové formáty a skontroluj prekryv publík s ostatnými kampaňami.",
      expectedImpact: "Zastavenie poklesu a stabilizácia CTR",
      impactScore: 66,
    });
  }

  if (totals.ctr < 1.5 && campaign.platform === "google" && campaign.type === "search") {
    insights.push({
      ...base,
      id: `${campaign.id}-ctr`,
      priority: "medium",
      category: "Creative",
      title: "Nízka miera prekliku (CTR)",
      problem: `CTR ${totals.ctr.toFixed(2)} % je nízke pre Search kampaň — reklamné texty nedostatočne rezonujú.`,
      solution:
        "Pridaj responzívne reklamy s 3–4 nadpismi navyše, využi rozšírenia (sitelinks, callouts) a otestuj výhody/USP v texte.",
      expectedImpact: "Vyššie CTR a nižšie CPC vďaka lepšiemu skóre kvality",
      impactScore: 58,
    });
  }

  if (campaign.trend === "up" && totals.roas >= 3) {
    insights.push({
      ...base,
      id: `${campaign.id}-scale`,
      priority: "high",
      category: "Budget",
      title: "Kampaň škáluje — zváž navýšenie rozpočtu",
      problem:
        "Kampaň rastie a udržiava si zdravú ROAS. Konzervatívny rozpočet brzdí ďalší rast tržieb.",
      solution:
        "Navýš rozpočet po 15–20 % každých 5–7 dní, kým ROAS zostáva nad cieľom. Priebežne dopĺňaj kreatívy.",
      expectedImpact: "Lineárny rast tržieb pri zachovaní ROAS",
      impactScore: 82,
    });
  }

  if (campaign.status === "learning") {
    insights.push({
      ...base,
      id: `${campaign.id}-learning`,
      priority: "low",
      category: "Bidding",
      title: "Kampaň je vo fáze učenia",
      problem:
        "Algoritmus stále zbiera dáta. Časté zásahy resetujú učenie a zhoršujú výsledky.",
      solution: "Drž rozpočet aj ponuky stabilné a vyhni sa väčším zmenám do ~30 konverzií.",
      expectedImpact: "Rýchlejšia stabilizácia výkonu",
      impactScore: 40,
    });
  }

  // Always provide at least 3 insights.
  if (insights.length < 3) {
    insights.push({
      ...base,
      id: `${campaign.id}-negatives`,
      priority: "low",
      category: "Keywords",
      title: "Pravidelná údržba a optimalizácia",
      problem:
        "Aj výkonná kampaň profituje z pravidelnej kontroly vyhľadávacích výrazov, umiestnení a publík.",
      solution:
        "Týždenne kontroluj search terms / placements, dopĺňaj vylučujúce položky a rotuj kreatívy.",
      expectedImpact: "Dlhodobo stabilná efektivita rozpočtu",
      impactScore: 35,
    });
  }

  return insights
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.impactScore - a.impactScore)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Account summary (3 sentences) computed from current totals.
// ---------------------------------------------------------------------------

export function getAccountSummary(): string {
  const totals = computeTotals(allCampaigns.flatMap((c) => c.daily.slice(-30)));
  const spendWoW = deltaWoW(
    allCampaigns.flatMap((c) => c.daily).slice(-14),
    "spend",
  );
  const growing = allCampaigns.filter((c) => c.trend === "up").length;
  const limited = allCampaigns.filter((c) => c.status === "limited").length;

  const trendWord = spendWoW >= 0 ? "rast" : "pokles";

  return (
    `Za posledných 30 dní účet minul ${formatCompactCurrency(totals.spend)} pri priemernej ROAS ${formatRoas(totals.roas)} ` +
    `naprieč ${allCampaigns.length} kampaňami. Týždenný ${trendWord} výdavkov je ${Math.abs(spendWoW).toFixed(1)} %, pričom ` +
    `${growing} kampaní rastie a ${limited} ${limited === 1 ? "je obmedzená" : "sú obmedzené"} rozpočtom. ` +
    `Najväčší potenciál je v presune rozpočtu z nevýkonných konkurenčných výrazov do brandu a retargetingu s vysokou návratnosťou.`
  );
}
