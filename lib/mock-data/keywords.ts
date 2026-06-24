// Keyword Intelligence — deterministic mock data + simulator helpers.
// All numeric fields are derived from a string hash so output is stable across
// SSR/CSR (no hydration mismatches) and across reloads.

export type KeywordTrend = "rising" | "stable" | "declining";

export interface ExpensiveKeyword {
  keyword: string;
  searchVolume: number;
  competition: number; // 0.7 - 1.0
  avgCPC: number; // 2.5 - 15.0 €
  trend: KeywordTrend;
  budgetEfficiencyScore: number; // 5 - 25
}

export interface LongTailKeyword {
  keyword: string;
  searchVolume: number; // 50 - 2000
  competition: number; // 0.1 - 0.45
  avgCPC: number; // 0.15 - 1.20 €
  trend: KeywordTrend;
  budgetEfficiencyScore: number; // 65 - 98
  relatedTo: string;
  estimatedMonthlyClicks: number; // at 200 € budget
  estimatedConversions: number;
  reason: string;
}

export interface NegativeKeyword {
  keyword: string;
  reason: string;
  estimatedWastedBudget: number; // € / month
}

export type SuggestedKeyword = LongTailKeyword;

// --- deterministic helpers ---------------------------------------------------

const TRENDS: KeywordTrend[] = ["rising", "stable", "declining"];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (n: number, d = 0) => {
  const p = 10 ** d;
  return Math.round(n * p) / p;
};
function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
}

// --- 1) EXPENSIVE / COMPETITIVE KEYWORDS ------------------------------------

const EXPENSIVE_TERMS = [
  "digitálny marketing",
  "tvorba webu",
  "web developer",
  "SEO optimalizácia",
  "online marketing",
  "e-shop tvorba",
  "grafický dizajn",
  "facebook reklama",
  "google reklama",
  "firemná web stránka",
  "tvorba e-shopu",
  "marketingová agentúra",
  "webdizajn",
  "PPC reklama",
  "správa sociálnych sietí",
  "logo dizajn",
  "redizajn webu",
  "eshop riešenie na mieru",
  "programovanie webu",
  "vývoj mobilnej aplikácie",
  "UX dizajn",
  "copywriting služby",
  "email marketing",
  "brandová stratégia",
  "content marketing",
  "video reklama",
  "influencer marketing",
  "konverzná optimalizácia",
  "automatizácia marketingu",
  "online reklamná kampaň",
];

function buildExpensive(keyword: string): ExpensiveKeyword {
  const r = rngFrom(hashStr(keyword));
  const searchVolume = Math.round(lerp(10000, 100000, r()) / 100) * 100;
  const competition = round(lerp(0.7, 1.0, r()), 2);
  const avgCPC = round(lerp(2.5, 15, r()), 2);
  const trend = pick(TRENDS, r());
  const budgetEfficiencyScore = Math.round(lerp(5, 25, r()));
  return { keyword, searchVolume, competition, avgCPC, trend, budgetEfficiencyScore };
}

export const expensiveKeywords: ExpensiveKeyword[] = EXPENSIVE_TERMS.map(buildExpensive).sort(
  (a, b) => b.avgCPC - a.avgCPC,
);

// --- 2) LONG-TAIL RECOMMENDATIONS -------------------------------------------

const LONG_TAIL_TERMS: [string, string][] = [
  ["tvorba webstranky pre kaviaren nitra", "tvorba webu"],
  ["lacny web pre zivnostnika", "tvorba webu"],
  ["wordpress web developer zapadne slovensko", "web developer"],
  ["next js developer slovensko", "web developer"],
  ["webova stranka pre realitnu kancelariu", "firemná web stránka"],
  ["facebook reklama pre malu firmu", "facebook reklama"],
  ["google ads pre remeselnikov", "google reklama"],
  ["seo pre lokalne podniky nitra", "SEO optimalizácia"],
  ["tvorba eshopu pre malych predajcov", "e-shop tvorba"],
  ["cena tvorby webovej stranky slovensko", "tvorba webu"],
  ["web pre kadernicky salon", "firemná web stránka"],
  ["jednoduchy web pre zivnostnika cena", "tvorba webu"],
  ["wordpress stranka na mieru cena", "tvorba webu"],
  ["tvorba loga pre startup", "logo dizajn"],
  ["sprava instagramu pre restauraciu", "správa sociálnych sietí"],
  ["google reklama pre zubnu ambulanciu", "google reklama"],
  ["seo optimalizacia eshopu nitra", "SEO optimalizácia"],
  ["webstranka pre fitness trenera", "firemná web stránka"],
  ["tvorba webu pre neziskovku", "tvorba webu"],
  ["react developer na volnej nohe slovensko", "web developer"],
  ["eshop na shopify cena slovensko", "e-shop tvorba"],
  ["facebook reklama pre eshop s oblecenim", "facebook reklama"],
  ["lokalne seo google moja firma", "SEO optimalizácia"],
  ["graficky dizajn vizitky online", "grafický dizajn"],
  ["ppc kampan pre maly rozpocet", "google reklama"],
  ["tvorba webu pre advokatsku kancelariu", "firemná web stránka"],
  ["responzivny web pre mobil cena", "tvorba webu"],
  ["online marketing pre lokalnu kaviaren", "online marketing"],
  ["instagram reklama pre beauty salon", "facebook reklama"],
  ["web developer nitra recenzie", "web developer"],
  ["tvorba firemneho blogu", "content marketing"],
  ["email marketing pre maly eshop", "online marketing"],
  ["logo a branding pre kaviaren", "logo dizajn"],
  ["seo audit malej webstranky", "SEO optimalizácia"],
  ["tvorba eshopu woocommerce slovensko", "e-shop tvorba"],
  ["sprava google ads pre zivnostnika", "google reklama"],
  ["web pre autoservis nitra", "firemná web stránka"],
  ["lacna tvorba webu pre startup", "tvorba webu"],
  ["facebook reklama cennik mala firma", "facebook reklama"],
  ["landing page pre kampan cena", "tvorba webu"],
  ["seo copywriting pre eshop", "SEO optimalizácia"],
  ["tvorba webstranky pre penzion", "firemná web stránka"],
  ["sprava google ads pre lokalny biznis", "google reklama"],
  ["eshop s rychlym nasadenim cena", "e-shop tvorba"],
  ["webdizajn pre architektonicke studio", "grafický dizajn"],
  ["online reklama pre remeselnika nitra", "online marketing"],
  ["tvorba webu pre kvetinarstvo", "firemná web stránka"],
  ["social media manazer pre maly biznis", "správa sociálnych sietí"],
  ["konzultacia digitalneho marketingu cena", "digitálny marketing"],
  ["tvorba webu pre fyzioterapeuta", "firemná web stránka"],
];

function buildLongTail(keyword: string, relatedTo: string): LongTailKeyword {
  const r = rngFrom(hashStr(keyword));
  const searchVolume = Math.round(lerp(50, 2000, r()) / 10) * 10;
  const competition = round(lerp(0.1, 0.45, r()), 2);
  const avgCPC = round(lerp(0.15, 1.2, r()), 2);
  const trend = pick(TRENDS, r());
  const budgetEfficiencyScore = Math.round(lerp(65, 98, r()));
  const estimatedMonthlyClicks = Math.min(
    Math.floor(200 / avgCPC),
    Math.round(searchVolume * 0.3),
  );
  const estimatedConversions = Math.max(
    1,
    Math.round(estimatedMonthlyClicks * (0.03 + (budgetEfficiencyScore / 100) * 0.05)),
  );
  const reason =
    `Namiesto drahého výrazu „${relatedTo}“ (CPC často nad 5 €) cieli toto kľúčové slovo ` +
    `na konkrétny nákupný zámer s CPC iba ${avgCPC.toFixed(2)} € a konkurenciou ` +
    `${Math.round(competition * 100)} %. Pri rozpočte 200 € to znamená približne ` +
    `${estimatedMonthlyClicks} klikov a ${estimatedConversions} konverzií mesačne ` +
    `s výrazne vyššou relevanciou.`;

  return {
    keyword,
    searchVolume,
    competition,
    avgCPC,
    trend,
    budgetEfficiencyScore,
    relatedTo,
    estimatedMonthlyClicks,
    estimatedConversions,
    reason,
  };
}

export const longTailKeywords: LongTailKeyword[] = LONG_TAIL_TERMS.map(([k, rel]) =>
  buildLongTail(k, rel),
).sort((a, b) => b.budgetEfficiencyScore - a.budgetEfficiencyScore);

// --- 3) NEGATIVE KEYWORDS ----------------------------------------------------

const NEGATIVE_TERMS: [string, string][] = [
  ["zadarmo", "Hľadajú niečo bez platby — nikdy nenakúpia platenú službu."],
  ["free", "Anglický variant pre „zadarmo“ — používatelia bez nákupného zámeru."],
  ["ako urobiť sám", "DIY zámer — chcú si to spraviť svojpomocne, nie objednať."],
  ["tutorial", "Vzdelávací obsah, nie dopyt po službe."],
  ["návod", "Informačný zámer — hľadajú postup, nie dodávateľa."],
  ["šablóna zdarma", "Hľadajú bezplatné šablóny namiesto tvorby na mieru."],
  ["wordpress zadarmo", "Chcú free riešenie, nie platenú tvorbu webu."],
  ["wix", "Konkurenčná DIY platforma — iný typ zákazníka."],
  ["squarespace", "Konkurenčná DIY platforma — nehľadajú agentúru."],
  ["práca web developer", "Hľadajú zamestnanie, nie objednávku služby."],
  ["brigáda", "Hľadajú prácu, úplne mimo cieľovú skupinu."],
  ["kurz", "Chcú sa to naučiť, nie si objednať službu."],
  ["škola", "Vzdelávací zámer — žiadny nákupný úmysel."],
  ["ako sa naučiť", "Samoukovia — nehľadajú dodávateľa."],
  ["youtube", "Hľadajú video obsah, nie platenú službu."],
  ["open source", "Hľadajú bezplatné riešenia s otvoreným kódom."],
  ["stiahnuť zdarma", "Jasný free zámer bez ochoty platiť."],
  ["crack", "Hľadajú nelegálny softvér — bezcenná návštevnosť."],
  ["vzor zadarmo", "Chcú bezplatné vzory, nie objednávku."],
  ["ukážka zdarma", "Lovci bezplatných ukážok, nízka konverzia."],
  ["svojpomocne", "DIY zámer — spravia si to sami."],
  ["bez programovania", "Hľadajú no-code DIY návody, nie vývojára."],
  ["plat web developer", "Záujem o mzdy v odbore, nie o službu."],
  ["mzda", "Hľadajú platové info — mimo cieľovku."],
  ["freelancer hľadám prácu", "Hľadajú zákazky pre seba, nie dodávateľa."],
  ["fórum", "Diskusné vlákna — informačný zámer."],
  ["reddit", "Komunitné diskusie, nie nákupný zámer."],
  ["čo je", "Definičný/informačný dopyt bez úmyslu nakúpiť."],
  ["význam", "Hľadajú význam pojmu, nie službu."],
  ["definícia", "Slovníkový zámer — žiadna konverzia."],
  ["wikipedia", "Encyklopedický obsah, nie dopyt po službe."],
  ["online generátor zdarma", "Hľadajú bezplatný nástroj namiesto služby."],
  ["canva", "DIY grafický nástroj — iný typ používateľa."],
  ["shopify skúšobná verzia", "Chcú si to spraviť sami cez skúšobnú verziu."],
  ["webnode zadarmo", "Free DIY platforma, nie agentúra."],
  ["godaddy", "Hľadajú lacný hosting/DIY, nie tvorbu na mieru."],
  ["recenzia zamestnávateľa", "Hľadajú info o firme ako zamestnávateľovi."],
  ["ako začať", "Začiatočnícky informačný zámer."],
  ["samouk", "Chcú sa to naučiť sami."],
  ["demo zdarma", "Lovci bezplatných dem — slabá konverzia."],
];

function buildNegative(keyword: string, reason: string): NegativeKeyword {
  const r = rngFrom(hashStr(keyword));
  const estimatedWastedBudget = Math.round(lerp(15, 140, r()));
  return { keyword, reason, estimatedWastedBudget };
}

export const negativeKeywords: NegativeKeyword[] = NEGATIVE_TERMS.map(([k, reason]) =>
  buildNegative(k, reason),
).sort((a, b) => b.estimatedWastedBudget - a.estimatedWastedBudget);

export function totalNegativeSavings(): number {
  return negativeKeywords.reduce((acc, n) => acc + n.estimatedWastedBudget, 0);
}

// --- BUDGET SIMULATOR --------------------------------------------------------

export const SIMULATION = {
  expensive: { avgCPC: 6.4, conversionRate: 0.018, dailyBurn: 42 },
  longTail: { avgCPC: 0.92, conversionRate: 0.048 },
};

export interface BudgetSimResult {
  clicks: number;
  conversions: number;
  avgCPC: number;
  daysLasted: number;
  lastsMonth: boolean;
  costPerConversion: number;
}

export interface BudgetSimulation {
  expensive: BudgetSimResult;
  longTail: BudgetSimResult;
  clicksMultiplier: number;
}

export function simulateBudget(monthly: number): BudgetSimulation {
  const e = SIMULATION.expensive;
  const l = SIMULATION.longTail;

  const eClicks = Math.floor(monthly / e.avgCPC);
  const eConv = Math.max(0, Math.round(eClicks * e.conversionRate));
  const eDays = Math.max(1, Math.min(30, Math.round(monthly / e.dailyBurn)));

  const lClicks = Math.floor(monthly / l.avgCPC);
  const lConv = Math.max(1, Math.round(lClicks * l.conversionRate));

  return {
    expensive: {
      clicks: eClicks,
      conversions: eConv,
      avgCPC: e.avgCPC,
      daysLasted: eDays,
      lastsMonth: eDays >= 30,
      costPerConversion: eConv ? round(monthly / eConv, 2) : 0,
    },
    longTail: {
      clicks: lClicks,
      conversions: lConv,
      avgCPC: l.avgCPC,
      daysLasted: 30,
      lastsMonth: true,
      costPerConversion: lConv ? round(monthly / lConv, 2) : 0,
    },
    clicksMultiplier: eClicks ? round(lClicks / eClicks, 1) : 0,
  };
}

// --- "My list" performance estimate -----------------------------------------

export interface ListPerformance {
  clicks: number;
  conversions: number;
  avgCPC: number;
  costPerConversion: number;
}

export function estimateListPerformance(
  items: { avgCPC: number; efficiencyScore: number }[],
  monthly: number,
): ListPerformance {
  if (!items.length) return { clicks: 0, conversions: 0, avgCPC: 0, costPerConversion: 0 };
  const avgCPC = round(items.reduce((a, b) => a + b.avgCPC, 0) / items.length, 2);
  const clicks = Math.floor(monthly / avgCPC);
  const convRate =
    items.reduce((a, b) => a + (0.03 + (b.efficiencyScore / 100) * 0.05), 0) / items.length;
  const conversions = Math.max(0, Math.round(clicks * convRate));
  return {
    clicks,
    conversions,
    avgCPC,
    costPerConversion: conversions ? round(monthly / conversions, 2) : 0,
  };
}

// --- Alternatives + AI advisor ----------------------------------------------

export function getAlternativesFor(expensiveKeyword: string): LongTailKeyword[] {
  const matches = longTailKeywords.filter((l) => l.relatedTo === expensiveKeyword);
  if (matches.length >= 3) return matches.slice(0, 5);
  // top up with the most efficient long-tails if not enough direct matches
  const extra = longTailKeywords
    .filter((l) => l.relatedTo !== expensiveKeyword)
    .slice(0, 5 - matches.length);
  return [...matches, ...extra].slice(0, 5);
}

const ADVISOR_MODIFIERS = [
  "pre malé firmy",
  "cena a cenník",
  "nitra a okolie",
  "lacný na mieru",
  "pre živnostníkov",
  "recenzie a skúsenosti",
  "expert na mieru",
  "s rýchlym nasadením",
  "pre lokálny biznis",
  "balík pre startup",
];

export function generateKeywordSuggestions(seedRaw: string): SuggestedKeyword[] {
  const seed = (seedRaw.trim() || "tvorba webu").toLowerCase();
  return ADVISOR_MODIFIERS.map((m) => {
    const keyword = `${seed} ${m}`;
    const r = rngFrom(hashStr(keyword));
    const searchVolume = Math.round(lerp(60, 1500, r()) / 10) * 10;
    const competition = round(lerp(0.12, 0.42, r()), 2);
    const avgCPC = round(lerp(0.2, 1.05, r()), 2);
    const trend = pick(TRENDS, r());
    const budgetEfficiencyScore = Math.round(lerp(70, 97, r()));
    const estimatedMonthlyClicks = Math.min(
      Math.floor(200 / avgCPC),
      Math.round(searchVolume * 0.3),
    );
    const estimatedConversions = Math.max(
      1,
      Math.round(estimatedMonthlyClicks * (0.03 + (budgetEfficiencyScore / 100) * 0.05)),
    );
    const reason =
      `Nízka konkurencia (${Math.round(competition * 100)} %) a CPC iba ${avgCPC.toFixed(2)} € — ` +
      `pri rozpočte 200 € získaš približne ${estimatedMonthlyClicks} klikov mesačne ` +
      `s vysokým nákupným zámerom a relevanciou k „${seed}“.`;
    return {
      keyword,
      searchVolume,
      competition,
      avgCPC,
      trend,
      budgetEfficiencyScore,
      relatedTo: seed,
      estimatedMonthlyClicks,
      estimatedConversions,
      reason,
    };
  });
}
