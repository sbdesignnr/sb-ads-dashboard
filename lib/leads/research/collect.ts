// Zber dôkazov o jednej firme: (1) uložená analýza, (2) jej web (domov + kľúčové
// podstránky), (3) Google profil + recenzie, (4) konkurenti v meste s porovnaním
// funkcií webu. Všetko robí KÓD (bez AI) — každá položka má id a zdroj, ktorý sa dá
// otvoriť a overiť; stratég z nich potom cituje a kód citáty overuje.

import {
  digestPage,
  fetchHtml,
  hostOf,
  pickSubpages,
  siteFeatures,
  type SiteFeatures,
} from "./web";
import { findPlaceProfile, searchCompetitors, type PlaceProfile } from "./places";

export interface EvidenceItem {
  id: string; // E1, E2…
  kind: "stored" | "web" | "places" | "market";
  source: string; // URL alebo popis zdroja
  title: string;
  text: string;
}

export interface LeadForResearch {
  companyName: string;
  websiteUrl: string | null;
  companyCity: string | null;
  visualIssues?: string[];
  websiteIssues?: string[];
  aiVisualReason?: string | null;
  aiSummary?: string | null;
  pageSpeedMobile?: number | null;
  copyrightYear?: number | null;
  websiteTechnology?: string | null;
}

export interface CompetitorRow {
  name: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  features: SiteFeatures | null;
}

export interface MarketStats {
  keyword: string;
  city: string;
  total: number;
  withSite: number;
  booking: number;
  form: number;
  analytics: number;
  https: number;
  medianReviews: number | null;
  reviewRank: number | null; // poradie leadu podľa počtu recenzií (1 = najviac)
  ofRanked: number;
}

export interface EvidencePack {
  items: EvidenceItem[];
  competitors: CompetitorRow[];
  market: MarketStats | null;
  place: PlaceProfile | null;
  notes: string[]; // čo sa nepodarilo zistiť (transparentnosť)
}

const yn = (b: boolean) => (b ? "áno" : "nie");
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function collectEvidence(input: {
  lead: LeadForResearch;
  segmentName: string;
  keywords: string[];
}): Promise<EvidencePack> {
  const { lead, segmentName } = input;
  const items: EvidenceItem[] = [];
  const notes: string[] = [];
  let n = 0;
  const add = (kind: EvidenceItem["kind"], source: string, title: string, text: string) => {
    items.push({ id: `E${++n}`, kind, source, title, text });
  };

  // 1) uložená analýza (naša vlastná, z predošlého skenu)
  const stored = [
    lead.visualIssues?.length ? `Vizuálne problémy (z screenshotu): ${lead.visualIssues.join("; ")}` : "",
    lead.aiVisualReason ? `Celkový vizuálny dojem: ${lead.aiVisualReason}` : "",
    lead.websiteIssues?.length ? `Zistené nedostatky: ${lead.websiteIssues.join("; ")}` : "",
    lead.pageSpeedMobile != null ? `PageSpeed mobil: ${lead.pageSpeedMobile}/100` : "",
    lead.copyrightYear ? `Rok v pätičke: ${lead.copyrightYear}` : "",
    lead.websiteTechnology ? `Technológia webu: ${lead.websiteTechnology}` : "",
    lead.aiSummary ? `Predbežné zhrnutie: ${lead.aiSummary}` : "",
  ].filter(Boolean);
  if (stored.length) add("stored", "SB Design - uložená analýza webu", "Uložená analýza webu", stored.join("\n"));

  // 2) web firmy
  let ownFeatures: SiteFeatures | null = null;
  const host = lead.websiteUrl ? hostOf(lead.websiteUrl) : "";
  if (lead.websiteUrl) {
    const home = await fetchHtml(lead.websiteUrl);
    if (home) {
      const seenText = new Set<string>();
      const d = digestPage(home.html, home.finalUrl, 3000, seenText);
      ownFeatures = siteFeatures(home.html, home.finalUrl);
      add(
        "web",
        home.finalUrl,
        "Web firmy - úvodná stránka",
        `Názov: ${d.title}\nPopis: ${d.description || "(chýba)"}\nNadpisy: ${d.headings.join(" | ")}\nText:\n${d.text}`,
      );
      const subs = pickSubpages(d.links, home.finalUrl);
      const pages = await pool(subs, 4, async (u) => {
        const r = await fetchHtml(u);
        return r ? digestPage(r.html, r.finalUrl, 2600, seenText) : null;
      });
      for (const p of pages) {
        if (!p) continue;
        add("web", p.url, `Web firmy - ${p.title || p.url}`, `Nadpisy: ${p.headings.join(" | ")}\nText:\n${p.text}`);
      }
      const f = ownFeatures;
      add(
        "web",
        home.finalUrl,
        "Technické vlastnosti webu firmy (zistené kódom)",
        `HTTPS: ${yn(f.https)}; online rezervácia/objednávka: ${yn(f.hasBooking)}; kontaktný formulár: ${yn(f.hasForm)}; meranie návštevnosti: ${yn(f.hasAnalytics)}; štruktúrované dáta: ${yn(f.hasSchema)}; prispôsobenie mobilu (viewport): ${yn(f.mobileViewport)}; rok v pätičke: ${f.copyrightYear ?? "nezistený"}; platforma: ${f.platform ?? "nezistená"}`,
      );
    } else notes.push("Web firmy sa nepodarilo načítať.");
  }

  // 3) Google profil + recenzie
  const place = await findPlaceProfile(lead.companyName, lead.companyCity, lead.websiteUrl);
  if (place) {
    const rev = place.reviews
      .filter((r) => r.text)
      .slice(0, 5)
      .map((r) => `- ${r.rating ?? "?"}★ (${r.when}): „${r.text}“`)
      .join("\n");
    add(
      "places",
      place.mapsUrl ?? "Google Mapy",
      "Google profil firmy",
      [
        `Názov: ${place.name}`,
        `Hodnotenie: ${place.rating ?? "nezverejnené"} z 5, počet recenzií: ${place.reviewCount ?? "nezverejnené"}`,
        `Typ: ${place.type ?? "?"}; stav: ${place.status ?? "?"}; počet fotiek v profile: ${place.photos}`,
        place.summary ? `Popis od Googlu: ${place.summary}` : "",
        place.hours.length ? `Otváracie hodiny: ${place.hours.join("; ")}` : "Otváracie hodiny: v profile nie sú uvedené",
        rev ? `Posledné recenzie:\n${rev}` : "Recenzie: text nie je dostupný",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } else notes.push("Google profil firmy sa nenašiel (alebo nesedí doména webu).");

  // 4) konkurenti v meste
  let market: MarketStats | null = null;
  let competitors: CompetitorRow[] = [];
  const keyword = input.keywords[0] || segmentName;
  if (lead.companyCity) {
    const found = await searchCompetitors(keyword, lead.companyCity, host, 12);
    competitors = await pool(found, 6, async (c) => {
      let features: SiteFeatures | null = null;
      if (c.website) {
        const r = await fetchHtml(c.website, 8000);
        if (r) features = siteFeatures(r.html, r.finalUrl);
      }
      return { name: c.name, website: c.website, rating: c.rating, reviewCount: c.reviewCount, features };
    });
    if (competitors.length) {
      const withFeat = competitors.filter((c) => c.features);
      const counts = competitors.map((c) => c.reviewCount).filter((x): x is number => x != null);
      let reviewRank: number | null = null;
      let ofRanked = 0;
      if (place?.reviewCount != null) {
        const all = [...counts, place.reviewCount];
        ofRanked = all.length;
        reviewRank = all.filter((x) => x > place.reviewCount!).length + 1;
      }
      market = {
        keyword,
        city: lead.companyCity,
        total: competitors.length,
        withSite: withFeat.length,
        booking: withFeat.filter((c) => c.features!.hasBooking).length,
        form: withFeat.filter((c) => c.features!.hasForm).length,
        analytics: withFeat.filter((c) => c.features!.hasAnalytics).length,
        https: withFeat.filter((c) => c.features!.https).length,
        medianReviews: median(counts),
        reviewRank,
        ofRanked,
      };
      const rows = competitors
        .map((c, i) => {
          const f = c.features;
          return `${i + 1}. ${c.name} | ${c.rating ?? "?"}★ (${c.reviewCount ?? "?"} recenzií) | web: ${c.website ? hostOf(c.website) : "nemá v profile"}${
            f
              ? ` | online rezervácia: ${yn(f.hasBooking)} | formulár: ${yn(f.hasForm)} | HTTPS: ${yn(f.https)} | rok v pätičke: ${f.copyrightYear ?? "?"} | platforma: ${f.platform ?? "?"}`
              : ""
          }`;
        })
        .join("\n");
      const own = ownFeatures
        ? `TÁTO FIRMA | ${place?.rating ?? "?"}★ (${place?.reviewCount ?? "?"} recenzií) | online rezervácia: ${yn(ownFeatures.hasBooking)} | formulár: ${yn(ownFeatures.hasForm)} | HTTPS: ${yn(ownFeatures.https)} | rok v pätičke: ${ownFeatures.copyrightYear ?? "?"} | platforma: ${ownFeatures.platform ?? "?"}`
        : "";
      const summary = [
        `Zo ${market.withSite} konkurentov s dostupným webom má online rezerváciu/objednávku ${market.booking}, kontaktný formulár ${market.form}, HTTPS ${market.https}, meranie návštevnosti ${market.analytics}.`,
        market.medianReviews != null ? `Medián počtu Google recenzií konkurentov: ${market.medianReviews}.` : "",
        market.reviewRank != null
          ? `Podľa počtu Google recenzií je táto firma na ${market.reviewRank}. mieste z ${market.ofRanked} (spolu s konkurentmi).`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      add(
        "market",
        `Google Mapy: hľadanie „${keyword} ${lead.companyCity}“ + verejné weby konkurentov`,
        `Konkurenti v meste (${keyword}, ${lead.companyCity})`,
        `${rows}\n${own}\nSÚHRN:\n${summary}`,
      );
    } else notes.push("Konkurentov v meste sa nepodarilo nájsť.");
  } else notes.push("Firma nemá známe mesto - konkurenti sa nehľadali.");

  return { items, competitors, market, place, notes };
}
