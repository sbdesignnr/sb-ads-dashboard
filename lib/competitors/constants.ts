// Fixed competitor list + regional data + SB Design profile used across the
// scraper, analyzer and UI.

export const COMPETITORS: { name: string; url: string }[] = [
  { name: "Monkey Media", url: "https://monkeymedia.sk" },
  { name: "iFocus", url: "https://www.ifocus.sk" },
  { name: "Madviso", url: "https://madviso.sk" },
  { name: "UI42", url: "https://www.ui42.sk" },
  { name: "Bigway", url: "https://www.bigway.sk" },
  { name: "Visibility", url: "https://visibility.sk" },
];

export const SB_DESIGN_PROFILE = {
  name: "SB Design",
  url: "sbdesign.sk",
  location: "Nitra",
  services: ["tvorba webstránok (Next.js, WordPress)", "Google Ads", "Meta Ads", "SEO", "správa webov"],
  pricing: "Starter 1500-2200€, Business 3200-4500€, Premium 5000-7500€, Retainer 150-250€/mes",
  strengths: ["moderné technológie (Next.js)", "rýchlosť", "dizajn", "osobný prístup"],
};

export const ANALYSIS_SYSTEM_PROMPT = `Si expert na konkurenčnú analýzu v oblasti web developmentu a digitálneho marketingu na Slovensku.

Analyzuješ web konkurenta SB Design Agency (sbdesign.sk) — web development a digitálna agentúra z Nitry.

SB Design služby: tvorba webstránok (Next.js, WordPress), Google Ads, Meta Ads, SEO, správa webov
SB Design ceny: Starter 1500-2200€, Business 3200-4500€, Premium 5000-7500€, Retainer 150-250€/mes
SB Design výhody: moderné technológie (Next.js), rýchlosť, dizajn, osobný prístup

Na základe scraped dát konkurenta:
1. Zhrň čo ponúkajú (služby, špecializácia)
2. Odhadni ich cenové pozicionovanie
3. Identifikuj ich 3 hlavné silné stránky
4. Identifikuj ich 3 hlavné slabé stránky / medzery
5. Navrhni 3 konkrétne veci čo SB Design môže urobiť lepšie alebo inak
6. Navrhni 1 blog článok ktorý by SB Design mal napísať aby pokryl medzeru v ich obsahu
7. Celkové hodnotenie hrozby: Nízka/Stredná/Vysoká + vysvetlenie

Odpovedaj v slovenčine, buď konkrétny a akčný.`;

export interface RegionInfo {
  key: string;
  name: string;
  avgSalary: number;
  gdpPerCapita: number;
  businessDensity: number; // firms per 1000 inhabitants (approx)
  priceMin: number;
  priceMax: number;
  // Approximate position on a schematic map of Slovakia (0-100 west→east, 0-100 north→south)
  x: number;
  y: number;
}

// Approx. values based on Štatistický úrad SR (2024) salary data; pricing per brief.
export const REGIONS: RegionInfo[] = [
  { key: "BA", name: "Bratislavský kraj", avgSalary: 1800, gdpPerCapita: 38000, businessDensity: 92, priceMin: 2500, priceMax: 5000, x: 8, y: 80 },
  { key: "TT", name: "Trnavský kraj", avgSalary: 1200, gdpPerCapita: 21000, businessDensity: 61, priceMin: 1800, priceMax: 3500, x: 18, y: 64 },
  { key: "TN", name: "Trenčiansky kraj", avgSalary: 1100, gdpPerCapita: 17000, businessDensity: 55, priceMin: 1500, priceMax: 3000, x: 30, y: 42 },
  { key: "NR", name: "Nitriansky kraj", avgSalary: 1050, gdpPerCapita: 16000, businessDensity: 52, priceMin: 1400, priceMax: 2800, x: 27, y: 76 },
  { key: "ZA", name: "Žilinský kraj", avgSalary: 1150, gdpPerCapita: 17500, businessDensity: 57, priceMin: 1600, priceMax: 3200, x: 44, y: 26 },
  { key: "BB", name: "Banskobystrický kraj", avgSalary: 1000, gdpPerCapita: 15000, businessDensity: 48, priceMin: 1300, priceMax: 2600, x: 53, y: 58 },
  { key: "PO", name: "Prešovský kraj", avgSalary: 950, gdpPerCapita: 13000, businessDensity: 44, priceMin: 1200, priceMax: 2400, x: 76, y: 30 },
  { key: "KE", name: "Košický kraj", avgSalary: 1100, gdpPerCapita: 16500, businessDensity: 50, priceMin: 1500, priceMax: 3000, x: 80, y: 60 },
];

// Service detection dictionary: substring → canonical tag.
export const SERVICE_KEYWORDS: { match: string[]; tag: string }[] = [
  { match: ["tvorba web", "webstrán", "web stránk", "webové stránk", "tvorba stránok", "web dizajn", "webdizajn", "webdevelopment", "web development"], tag: "Tvorba webov" },
  { match: ["e-shop", "eshop", "e-commerce", "internetový obchod", "online obchod"], tag: "E-shopy" },
  { match: ["seo", "optimalizácia pre vyhľadáva", "search engine"], tag: "SEO" },
  { match: ["google ads", "google reklam", "ppc", "adwords"], tag: "Google Ads" },
  { match: ["meta ads", "facebook reklam", "instagram reklam", "fb reklam", "sociálne siete", "social media"], tag: "Meta / Social" },
  { match: ["marketing", "online marketing", "digitálny marketing", "performance"], tag: "Marketing" },
  { match: ["grafik", "grafic", "logo", "branding", "vizuálna identita", "dizajn značky"], tag: "Grafika / Branding" },
  { match: ["mobiln", "aplikác", "app develop"], tag: "Mobilné apky" },
  { match: ["copywriting", "obsah", "content", "texty"], tag: "Obsah / Copy" },
  { match: ["udržb", "správa web", "podpor", "servis"], tag: "Správa / Údržba" },
  { match: ["ux", "ui", "user experience", "použiteľnos"], tag: "UX / UI" },
  { match: ["email marketing", "newsletter", "mailing"], tag: "Email marketing" },
];

// Tech detection: substring in HTML (lowercased) → tech label.
export const TECH_SIGNATURES: { match: string[]; tag: string }[] = [
  { match: ["wp-content", "wp-includes", "wordpress"], tag: "WordPress" },
  { match: ["/_next/", "__next_data__", "_next/static"], tag: "Next.js" },
  { match: ["data-reactroot", "react.production", "/react@", "_reactlisten"], tag: "React" },
  { match: ["cdn.shopify", "shopify"], tag: "Shopify" },
  { match: ["webflow"], tag: "Webflow" },
  { match: ["squarespace"], tag: "Squarespace" },
  { match: ["wix.com", "wixstatic"], tag: "Wix" },
  { match: ["joomla"], tag: "Joomla" },
  { match: ["drupal"], tag: "Drupal" },
  { match: ["elementor"], tag: "Elementor" },
  { match: ["bootstrap"], tag: "Bootstrap" },
  { match: ["jquery"], tag: "jQuery" },
  { match: ["googletagmanager"], tag: "Google Tag Manager" },
  { match: ["google-analytics", "gtag/js", "ga.js"], tag: "Google Analytics" },
  { match: ["connect.facebook.net", "fbq("], tag: "Meta Pixel" },
  { match: ["hotjar"], tag: "Hotjar" },
];

// Blog topic pool used by the heuristic blog-gap suggester.
export const BLOG_TOPIC_POOL: { title: string; about: string }[] = [
  { title: "Koľko stojí web v roku 2025? Transparentný cenník", about: "cenová transparentnosť" },
  { title: "WordPress vs. Next.js — ktoré riešenie je rýchlejšie?", about: "moderné technológie" },
  { title: "Ako zrýchliť web a zlepšiť Core Web Vitals", about: "rýchlosť a výkon" },
  { title: "Google Ads pre malé firmy: koľko investovať a kde začať", about: "PPC pre malé firmy" },
  { title: "Lokálne SEO pre firmy v Nitrianskom kraji", about: "lokálne SEO" },
  { title: "Redizajn webu: kedy sa oplatí a čo si od neho sľubovať", about: "redizajn" },
  { title: "E-shop na mieru vs. šablóna — čo sa naozaj oplatí", about: "e-shop riešenia" },
  { title: "Meta Ads pre eshopy: retargeting košíka krok za krokom", about: "meta retargeting" },
  { title: "Prečo je rýchlosť webu dôležitejšia než si myslíte", about: "rýchlosť" },
];
