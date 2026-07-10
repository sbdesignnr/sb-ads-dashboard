import type { CrawlResult, CrawledPage } from "./crawler";

/**
 * Pure check functions: crawl data (+ optional GSC/PSI signals) in, concrete
 * tasks out. Every draft must answer four questions the user actually has:
 *   why does this matter *for my site* (with real numbers),
 *   what exactly do I do,
 *   what should improve,
 *   and when do we measure it.
 */

export type Pillar = "technical" | "onpage" | "content" | "authority" | "local";

export interface TaskDraft {
  checkKey: string; // stable → re-running an audit updates, never duplicates
  pillar: Pillar;
  title: string;
  why: string;
  steps: string[];
  codeSnippet?: string;
  targetUrl?: string;
  effortMin: number;
  impact: number; // 1-5
  metric?: string;
  metricScope?: string;
  expectedNote?: string;
  verifyAfterDays?: number;
}

/**
 * Do-first ordering. The ratio term rewards quick wins (a 15-min title fix really
 * does beat a 3-hour refactor), but a flat impact floor makes sure a severe issue
 * — a 9-second LCP, a robots.txt blocking the site — can never be buried under a
 * pile of cheap cosmetic tasks just because it takes an afternoon.
 */
export function priorityOf(impact: number, effortMin: number): number {
  return Math.round((impact ** 2 * 100) / Math.max(10, effortMin) + impact * 40);
}

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;
const THIN_WORDS = 300;

const path = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

const isProjectPage = (p: CrawledPage) => /^\/projekty\/[^/]+$/.test(path(p.url));
const isBlogPost = (p: CrawledPage) => /^\/blog\/[^/]+$/.test(path(p.url));

// ---------------------------------------------------------------- technical

function technicalChecks(c: CrawlResult): TaskDraft[] {
  const out: TaskDraft[] = [];

  if (!c.robotsTxt.found) {
    out.push({
      checkKey: "technical:robots-missing",
      pillar: "technical",
      title: "Chýba robots.txt",
      why: "Bez robots.txt nemá Google explicitné pokyny a nevie, kde hľadať sitemap. Je to jeden z prvých súborov, ktoré crawler žiada.",
      steps: ["Vytvor app/robots.ts", "Uveď v ňom odkaz na sitemap.xml", "Over na /robots.txt, že vracia 200"],
      effortMin: 15,
      impact: 4,
    });
  } else if (c.robotsTxt.disallowsAll) {
    out.push({
      checkKey: "technical:robots-disallow-all",
      pillar: "technical",
      title: "KRITICKÉ: robots.txt blokuje celý web",
      why: "Pravidlo `Disallow: /` pre všetkých robotov zabraňuje indexácii. Web sa nemôže zobraziť vo vyhľadávaní.",
      steps: ["Odstráň `Disallow: /` z robots.txt", "Over v Search Console → Kontrola URL"],
      effortMin: 10,
      impact: 5,
    });
  } else if (!c.robotsTxt.sitemapUrls.length) {
    out.push({
      checkKey: "technical:robots-no-sitemap",
      pillar: "technical",
      title: "robots.txt neodkazuje na sitemap",
      why: "Odkaz na sitemap v robots.txt urýchľuje objavenie nových stránok, hlavne pre Bing a menšie crawlery.",
      steps: ["Do app/robots.ts pridaj `sitemap: 'https://www.sbdesign.sk/sitemap.xml'`"],
      effortMin: 5,
      impact: 2,
    });
  }

  if (!c.sitemap.found) {
    out.push({
      checkKey: "technical:sitemap-missing",
      pillar: "technical",
      title: "Chýba sitemap.xml",
      why: "Sitemap je zoznam stránok, ktoré chceš mať zaindexované. Bez neho Google objavuje stránky len cez odkazy — pomalšie a nespoľahlivo.",
      steps: ["Vytvor app/sitemap.ts", "Zahrň všetky verejné stránky vrátane blogu", "Odošli sitemap v Search Console"],
      effortMin: 30,
      impact: 5,
    });
  }

  const broken = c.pages.filter((p) => !p.ok);
  if (broken.length) {
    out.push({
      checkKey: "technical:sitemap-broken-urls",
      pillar: "technical",
      title: `${broken.length} URL zo sitemap nevracia 200`,
      why: `Sitemap sľubuje Googlu stránky, ktoré nefungujú (${broken.map((p) => `${path(p.url)} → ${p.status}`).join(", ")}). Znižuje to dôveru v sitemap a plytvá crawl budgetom.`,
      steps: ["Oprav alebo odstráň nefunkčné URL zo sitemap", "Over v Search Console → Sitemapy, že nehlási chyby"],
      effortMin: 20,
      impact: 4,
    });
  }

  const noCanonical = c.pages.filter((p) => p.ok && !p.canonical);
  if (noCanonical.length) {
    out.push({
      checkKey: "technical:canonical-missing",
      pillar: "technical",
      title: `${noCanonical.length} stránok bez canonical`,
      why: "Canonical hovorí Googlu, ktorá verzia URL je tá pravá. Bez neho hrozí, že sa duplicitné varianty (s/bez www, s parametrami) rozdelia o hodnotenie.",
      steps: ["V generateMetadata pridaj `alternates: { canonical: '<url>' }`", "Over, že canonical ukazuje sám na seba"],
      targetUrl: noCanonical[0]?.url,
      effortMin: 25,
      impact: 3,
    });
  }

  // The single most destructive canonical mistake: a page declaring some OTHER
  // page as its canonical. Google then folds it into that page and stops ranking
  // it independently. Usually caused by `alternates.canonical` set once in the
  // root layout and inherited by every child route.
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  const wrongCanonical = c.pages.filter((p) => p.ok && p.canonical && norm(p.canonical) !== norm(p.url));
  if (wrongCanonical.length) {
    const home = norm(c.origin);
    const toHome = wrongCanonical.filter((p) => norm(p.canonical!) === home);
    out.push({
      checkKey: "technical:canonical-not-self",
      pillar: "technical",
      title: `KRITICKÉ: ${wrongCanonical.length} stránok kanonizuje na inú URL`,
      why:
        `${wrongCanonical.length} z ${c.pages.length} stránok má canonical ukazujúci inam${toHome.length ? `, z toho ${toHome.length} priamo na homepage` : ""}. ` +
        `Tým Googlu hovoríš „táto stránka je duplikát, neindexuj ju samostatne“ — signály sa zlejú do cieľovej URL a podstránky prakticky vypadnú z výsledkov. ` +
        `Postihnuté: ${wrongCanonical.slice(0, 6).map((p) => path(p.url)).join(", ")}${wrongCanonical.length > 6 ? ` a ďalšie` : ""}. ` +
        `Toto je najčastejšie príčina „web mám, ale organika je nula“.`,
      steps: [
        "V app/layout.tsx ODSTRÁŇ `alternates: { canonical: site.url }` z root metadata — deti ho dedia",
        "Každej stránke daj vlastný self-referencing canonical v jej generateMetadata",
        "Pre dynamické routy (blog/[slug], projekty/[slug]) zlož canonical zo slugu",
        "Over: fetchni každú URL a skontroluj, že canonical ukazuje sám na seba",
        "V Search Console → Kontrola URL over, že „Používateľom vybraná kanonická“ = „Google vybraná kanonická“",
      ],
      codeSnippet: `// app/layout.tsx — canonical PREČ z root metadata
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // alternates: { canonical: site.url },  ← ZMAZAŤ
};

// app/sluzby/page.tsx (a každá ďalšia statická stránka)
export const metadata: Metadata = {
  title: "Tvorba webstránok na mieru | SB Design Nitra",
  alternates: { canonical: "/sluzby" },   // metadataBase doplní doménu
};

// app/projekty/[slug]/page.tsx — dynamicky
export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params;
  return { alternates: { canonical: \`/projekty/\${slug}\` } };
}`,
      effortMin: 60,
      impact: 5,
      metric: "gsc_impressions",
      expectedNote:
        "Podstránky sa začnú indexovať samostatne. Reindexácia trvá 2–6 týždňov; očakávaj násobný nárast impresií na /sluzby, /projekty a case studies.",
      verifyAfterDays: 42,
    });
  }

  const noindex = c.pages.filter((p) => p.ok && /noindex/i.test(p.robotsMeta ?? ""));
  if (noindex.length) {
    out.push({
      checkKey: "technical:noindex-leak",
      pillar: "technical",
      title: `${noindex.length} stránok má noindex, hoci sú v sitemap`,
      why: `Protirečivý signál: sitemap ich ponúka na indexáciu, meta robots to zakazuje (${noindex.map((p) => path(p.url)).join(", ")}).`,
      steps: ["Rozhodni, či stránka má byť v indexe", "Ak áno, odstráň noindex. Ak nie, vyhoď ju zo sitemap"],
      effortMin: 15,
      impact: 4,
    });
  }

  return out;
}

// ------------------------------------------------------------------ on-page

function onPageChecks(c: CrawlResult): TaskDraft[] {
  const out: TaskDraft[] = [];
  const live = c.pages.filter((p) => p.ok);

  // Titles — one task per page, they need individually written copy.
  for (const p of live) {
    const len = p.title?.trim().length ?? 0;
    if (len === 0) {
      out.push({
        checkKey: `onpage:title-missing:${path(p.url)}`,
        pillar: "onpage",
        title: `Chýba title: ${path(p.url)}`,
        why: "Title je najsilnejší on-page signál a zároveň nadpis vo výsledkoch vyhľadávania.",
        steps: [`Doplň title (${TITLE_MIN}–${TITLE_MAX} znakov) s hlavným kľúčovým slovom na začiatku`],
        targetUrl: p.url,
        effortMin: 10,
        impact: 5,
        metric: "gsc_clicks",
        metricScope: p.url,
        expectedNote: "Stránka začne získavať kliky z organiku.",
      });
    } else if (len < TITLE_MIN) {
      out.push({
        checkKey: `onpage:title-short:${path(p.url)}`,
        pillar: "onpage",
        title: `Príliš krátky title (${len} zn.): ${path(p.url)}`,
        why: `Title má ${len} znakov, Google zobrazuje ~${TITLE_MAX}. Nevyužívaš ${TITLE_MAX - len} znakov, do ktorých sa zmestí kľúčové slovo aj lokalita — a širší, výstižnejší title zvyšuje CTR.`,
        steps: [
          `Prepíš title na ${TITLE_MIN}–${TITLE_MAX} znakov`,
          "Hlavné kľúčové slovo daj na začiatok",
          "Pridaj lokalitu (Nitra) alebo odlíšenie (napr. „na mieru“)",
          "Nikdy needituj title na dvoch stránkach rovnako",
        ],
        targetUrl: p.url,
        effortMin: 15,
        impact: 4,
        metric: "gsc_ctr",
        metricScope: p.url,
        expectedNote: "CTR z organiku o 15–40 % vyššie (relatívne), impresie bez zmeny.",
      });
    } else if (len > TITLE_MAX) {
      out.push({
        checkKey: `onpage:title-long:${path(p.url)}`,
        pillar: "onpage",
        title: `Príliš dlhý title (${len} zn.): ${path(p.url)}`,
        why: `Google ho v SERP odreže (~${TITLE_MAX} znakov), takže koniec — často práve značka alebo CTA — používateľ nikdy neuvidí.`,
        steps: [`Skráť title pod ${TITLE_MAX} znakov`, "Zachovaj kľúčové slovo na začiatku"],
        targetUrl: p.url,
        effortMin: 10,
        impact: 3,
        metric: "gsc_ctr",
        metricScope: p.url,
      });
    }

    const dlen = p.metaDescription?.trim().length ?? 0;
    if (dlen === 0) {
      out.push({
        checkKey: `onpage:desc-missing:${path(p.url)}`,
        pillar: "onpage",
        title: `Chýba meta description: ${path(p.url)}`,
        why: "Bez description si Google vyskladá útržok sám — býva to nezáživné a znižuje to CTR. Description nie je ranking faktor, ale priamo ovplyvňuje, koľko ľudí klikne.",
        steps: [`Napíš description ${DESC_MIN}–${DESC_MAX} znakov s benefitom a výzvou k akcii`],
        targetUrl: p.url,
        effortMin: 10,
        impact: 3,
        metric: "gsc_ctr",
        metricScope: p.url,
      });
    } else if (dlen > DESC_MAX) {
      out.push({
        checkKey: `onpage:desc-long:${path(p.url)}`,
        pillar: "onpage",
        title: `Príliš dlhá meta description (${dlen} zn.): ${path(p.url)}`,
        why: `Google odreže description okolo ${DESC_MAX} znakov.`,
        steps: [`Skráť pod ${DESC_MAX} znakov`],
        targetUrl: p.url,
        effortMin: 5,
        impact: 2,
        metric: "gsc_ctr",
        metricScope: p.url,
      });
    }

    if (p.h1.length !== 1) {
      out.push({
        checkKey: `onpage:h1-count:${path(p.url)}`,
        pillar: "onpage",
        title: `${p.h1.length === 0 ? "Chýba H1" : `${p.h1.length}× H1`}: ${path(p.url)}`,
        why: "Presne jeden H1 jasne definuje tému stránky. Nula alebo viac H1 rozostruje, o čom stránka je.",
        steps: ["Ponechaj práve jeden H1 s hlavným kľúčovým slovom", "Podnadpisy prerob na H2/H3"],
        targetUrl: p.url,
        effortMin: 10,
        impact: 3,
      });
    }
  }

  // Images without alt — aggregate, they're fixed in one sweep per page.
  const worst = live
    .map((p) => ({ p, missing: p.images.filter((i) => !i.alt || !i.alt.trim()).length }))
    .filter((x) => x.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  for (const { p, missing } of worst.slice(0, 5)) {
    out.push({
      checkKey: `onpage:img-alt:${path(p.url)}`,
      pillar: "onpage",
      title: `${missing} obrázkov bez alt textu: ${path(p.url)}`,
      why: `Z ${p.images.length} obrázkov má ${missing} prázdny alt. Alt text je jediné, čo Google o obrázku číta — bez neho neexistuješ v Google Images a prichádzaš o prístupnosť (a teda aj o časť UX signálov).`,
      steps: [
        "Každému obsahovému obrázku doplň alt, ktorý popisuje, čo na ňom je",
        "Kľúčové slovo použi len tam, kde dáva zmysel — nespamuj",
        "Čisto dekoratívnym obrázkom nechaj alt=\"\" (prázdny, nie chýbajúci)",
      ],
      targetUrl: p.url,
      effortMin: Math.min(120, 3 * missing),
      impact: 3,
      metric: "gsc_impressions",
      metricScope: p.url,
      expectedNote: "Nové impresie z Google Images a lepšia tematická relevancia stránky.",
    });
  }

  // Thin content on money pages — ONE task listing the pages. Twelve near-identical
  // tasks would drown the queue; it's the same playbook applied N times.
  const thin = live.filter((x) => isProjectPage(x) && x.wordCount < THIN_WORDS).sort((a, b) => a.wordCount - b.wordCount);
  if (thin.length) {
    const list = thin.map((p) => `${path(p.url)} (${p.wordCount})`).join(", ");
    out.push({
      checkKey: "onpage:thin-case-studies",
      pillar: "onpage",
      title: `${thin.length} case studies má tenký obsah (pod ${THIN_WORDS} slov)`,
      why: `Rozsah ${thin[0].wordCount}–${thin[thin.length - 1].wordCount} slov: ${list}. Konkurenti v SERP pre dopyty typu „tvorba webstránok <odvetvie>“ majú spravidla 700+ slov. Málo textu = málo tematických signálov a takmer žiadna šanca na long-tail dopyty — pritom práve tieto stránky dokazujú, že vieš robiť pre dané odvetvie.`,
      steps: [
        "Každú rozšír na 600–900 slov: východisko, cieľ, riešenie, výsledok v číslach",
        "Pridaj citát klienta (E-E-A-T signál)",
        "Prelinkuj na súvisiacu službu na /sluzby a na 1–2 príbuzné projekty",
        "Doplň konkrétny merateľný výsledok (napr. „+40 % dopytov za 3 mesiace“)",
        "Začni tými najkratšími — majú najväčší priestor na zlepšenie",
      ],
      targetUrl: thin[0].url,
      effortMin: 60,
      impact: 3,
      metric: "gsc_impressions",
      expectedNote: `Long-tail impresie na case studies; typicky +30–100 % impresií do 8 týždňov po prepísaní všetkých ${thin.length}.`,
      verifyAfterDays: 56,
    });
  }

  return out;
}

// -------------------------------------------------------- structured data

function schemaChecks(c: CrawlResult): TaskDraft[] {
  const out: TaskDraft[] = [];
  const live = c.pages.filter((p) => p.ok);
  const has = (p: CrawledPage, t: string) => p.jsonLdTypes.includes(t);

  const deep = live.filter((p) => path(p.url).split("/").filter(Boolean).length >= 2);
  const noBreadcrumb = deep.filter((p) => !has(p, "BreadcrumbList"));
  if (noBreadcrumb.length) {
    out.push({
      checkKey: "technical:schema-breadcrumb",
      pillar: "technical",
      title: `${noBreadcrumb.length} podstránok bez BreadcrumbList schema`,
      why: "BreadcrumbList mení URL vo výsledku vyhľadávania na čitateľnú cestu (Domov › Projekty › Starea) namiesto surovej URL. Zvyšuje CTR a pomáha Googlu pochopiť štruktúru webu.",
      steps: [
        "Vytvor komponent <BreadcrumbJsonLd> a vlož ho do app/projekty/[slug]/page.tsx",
        "Over v Google Rich Results Test",
      ],
      codeSnippet: `// app/components/BreadcrumbJsonLd.tsx
export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: it.url,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}`,
      targetUrl: noBreadcrumb[0]?.url,
      effortMin: 40,
      impact: 3,
      metric: "gsc_ctr",
      expectedNote: "Čitateľná cesta v SERP; typicky +5–15 % CTR na podstránkach.",
    });
  }

  const services = live.find((p) => path(p.url) === "/sluzby");
  if (services && !has(services, "Service") && !has(services, "OfferCatalog")) {
    out.push({
      checkKey: "technical:schema-service",
      pillar: "technical",
      title: "/sluzby nemá Service schema",
      why: "Stránka služieb je tvoja najkomerčnejšia stránka. Service schema explicitne hovorí Googlu, aké služby ponúkaš a v akej oblasti — kľúčové pre lokálne komerčné dopyty.",
      steps: [
        "Pre každú službu pridaj Service JSON-LD s areaServed a provider",
        "Prepoj provider na existujúci ProfessionalService (@id)",
        "Over v Rich Results Test",
      ],
      targetUrl: services.url,
      effortMin: 45,
      impact: 4,
      metric: "gsc_impressions",
      metricScope: services.url,
      expectedNote: "Lepšia relevancia pre komerčné dopyty; +10–25 % impresií na /sluzby.",
    });
  }

  if (services && !has(services, "FAQPage")) {
    out.push({
      checkKey: "technical:schema-faq",
      pillar: "technical",
      title: "Pridaj FAQ sekciu + FAQPage schema na /sluzby",
      why: "FAQ obsah cieli na otázkové dopyty („koľko stojí web“, „ako dlho trvá tvorba webu“) a FAQPage schema ich môže vyniesť do People Also Ask. Zároveň prirodzene predlžuje tenký obsah.",
      steps: [
        "Napíš 6–8 otázok, ktoré ti klienti reálne kladú (cena, termín, čo potrebujem dodať, hosting…)",
        "Odpovedz konkrétne, 40–80 slov na otázku",
        "Pridaj FAQPage JSON-LD",
        "Over v Rich Results Test",
      ],
      targetUrl: services.url,
      effortMin: 90,
      impact: 4,
      metric: "gsc_impressions",
      metricScope: services.url,
      expectedNote: "Nové otázkové impresie a šanca na People Also Ask; typicky +15–40 % impresií.",
      verifyAfterDays: 42,
    });
  }

  return out;
}

// ------------------------------------------------------------------ content

function contentChecks(c: CrawlResult, publishedPosts: number): TaskDraft[] {
  const out: TaskDraft[] = [];
  const blogPostsInSitemap = c.sitemap.urls.filter((u) => /\/blog\/[^/]+$/.test(path(u))).length;

  if (publishedPosts > 0 && blogPostsInSitemap === 0) {
    out.push({
      checkKey: "technical:sitemap-missing-blog",
      pillar: "technical",
      title: "Blogové články nie sú v sitemap.xml",
      why: `Máš ${publishedPosts} publikovaných článkov, ale sitemap neobsahuje ani jednu /blog/<slug> URL. Google ich objaví len cez odkaz z /blog — pomaly a s nižšou prioritou. Celá investícia do obsahu sa tým brzdí.`,
      steps: [
        "V app/sitemap.ts načítaj publikované články a pridaj ich URL",
        "Nastav lastModified na dátum poslednej úpravy článku",
        "Odošli sitemap znova v Search Console",
      ],
      effortMin: 30,
      impact: 5,
      metric: "gsc_impressions",
      expectedNote: "Články sa zaindexujú do ~1–2 týždňov namiesto mesiacov.",
      verifyAfterDays: 21,
    });
  }

  if (publishedPosts < 3) {
    out.push({
      checkKey: "content:no-topical-authority",
      pillar: "content",
      title: `Blog má len ${publishedPosts} článok — chýba tematická autorita`,
      why: `Google hodnotí, či si autorita na tému. S ${publishedPosts} článkom nemáš šancu na informačné dopyty, ktoré tvoria väčšinu vyhľadávaní. Konkurencia, ktorá publikuje pravidelne, obsadí long-tail dopyty, cez ktoré prichádzajú budúci klienti.`,
      steps: [
        "Zvoľ 1 pilierovú tému (napr. „tvorba webstránok“) a 5–8 podporných článkov okolo nej",
        "Publikuj 1 článok týždenne — pripomienku už dostávaš na Telegram v pondelok o 9:00",
        "Každý podporný článok prelinkuj na pilier a pilier na všetky podporné",
        "Až keď je klaster hotový, začni ďalší",
      ],
      effortMin: 240,
      impact: 5,
      metric: "ga4_organic_sessions",
      expectedNote: "Organická návštevnosť rastie so zpožděním 3–6 mesiacov; prvý článok typicky ranguje po 6–10 týždňoch.",
      verifyAfterDays: 90,
    });
  }

  return out;
}

// ------------------------------------------------------- local + authority

function localAndAuthorityChecks(): TaskDraft[] {
  return [
    {
      checkKey: "local:gbp-optimize",
      pillar: "local",
      title: "Optimalizuj Google Business Profile",
      why: "Pre dopyty typu „tvorba webstránok Nitra“ rozhoduje Local Pack, ktorý je nad organickými výsledkami. GBP je jediná páka, ktorou ho ovplyvníš — a je zadarmo. Kompletnosť profilu je priamy ranking faktor v lokálnom vyhľadávaní.",
      steps: [
        "Vyplň profil na 100 %: kategórie (primárna „Webdesigner“), popis, otváracie hodiny, oblasť pôsobenia",
        "Nahraj min. 10 fotiek (logo, práce, ty osobne — tvár zvyšuje dôveru)",
        "Pridaj všetky služby z /sluzby ako položky služieb",
        "Publikuj príspevok aspoň 1× za 2 týždne",
        "Prepoj profil s webom cez sameAs v Organization JSON-LD",
      ],
      effortMin: 90,
      impact: 5,
      metric: "ga4_organic_sessions",
      expectedNote: "Zobrazenia v Local Pack a nárast lokálnych dopytov; merateľné v GBP Insights do 4–6 týždňov.",
      verifyAfterDays: 42,
    },
    {
      checkKey: "local:nap-citations",
      pillar: "local",
      title: "Konzistentné NAP citácie v SK katalógoch",
      why: "Google overuje existenciu firmy podľa zhody Názov–Adresa–Telefón naprieč webom. Nekonzistentné údaje oslabujú lokálnu dôveryhodnosť. Toto sú legitímne, nie spamové katalógy — zápis je bezpečný.",
      steps: [
        "Zapíš sa jednotne (rovnaký formát názvu, adresy aj telefónu) do: firmy.sk, azet.sk katalóg, zlatestranky.sk, orsr/živnostenský register (kontrola údajov)",
        "Použi presne rovnaký tvar ako v GBP a v pätičke webu",
        "Nikdy nepoužívaj hromadné „zápis do 100 katalógov“ služby — sú to link farmy",
      ],
      effortMin: 120,
      impact: 3,
      expectedNote: "Posilnenie lokálnych signálov; efekt sa prejaví v Local Pack pozíciách.",
      verifyAfterDays: 60,
    },
    {
      checkKey: "authority:client-backlinks",
      pillar: "authority",
      title: "Získaj odkazy od klientov, ktorým si robil web",
      why: "Máš 14 case studies — to je 14 reálnych webov, ktoré by mohli odkazovať na teba. Odkaz z relevantného SK webu v pätičke („Web vytvoril SB Design“) je presne ten typ odkazu, ktorý Google odmeňuje: prirodzený, tematicky relevantný, redakčný. Toto je najbezpečnejší a najlacnejší linkbuilding, aký máš k dispozícii.",
      steps: [
        "Prejdi 14 projektov a skontroluj, ktoré weby už odkazujú na sbdesign.sk",
        "Tam, kde odkaz chýba, napíš klientovi a ponúkni pätičkový kredit",
        "Anchor text nech je prirodzený („SB Design“ alebo „tvorba webu“), nie presné kľúčové slovo na všetkých",
        "Odkaz musí byť follow (nie nofollow) a v HTML, nie cez JS",
      ],
      effortMin: 120,
      impact: 4,
      expectedNote: "Rast doménovej autority; nové odkazy sa v GSC prejavia do 4–8 týždňov.",
      verifyAfterDays: 56,
    },
    {
      checkKey: "authority:reviews",
      pillar: "authority",
      title: "Zbieraj Google recenzie systematicky",
      why: "Počet a čerstvosť recenzií je jeden z najsilnejších faktorov Local Packu — a zároveň jediný ranking faktor, ktorý zároveň priamo zvyšuje konverzný pomer. AggregateRating schema ich potom môže zobraziť ako hviezdičky v SERP.",
      steps: [
        "Po odovzdaní každého projektu pošli klientovi priamy odkaz na napísanie recenzie z GBP",
        "Cieľ: min. 10 recenzií, potom 1–2 mesačne (čerstvosť sa počíta)",
        "Na každú recenziu odpovedz — Google to sleduje",
        "Keď máš 5+, pridaj AggregateRating do JSON-LD na /sluzby",
      ],
      effortMin: 60,
      impact: 4,
      expectedNote: "Hviezdičky v SERP + lepšia pozícia v Local Pack.",
      verifyAfterDays: 60,
    },
  ];
}

// -------------------------------------------------- core web vitals (PSI)

export interface CwvInput {
  url: string;
  lcp: number | null; // seconds, mobile
  cls: number | null;
  performance: number | null; // 0-100
}

function cwvChecks(cwv: CwvInput | null): TaskDraft[] {
  if (!cwv || cwv.lcp === null) return [];
  const out: TaskDraft[] = [];

  // Google's thresholds: LCP good ≤ 2.5 s, needs-improvement ≤ 4.0 s, poor above.
  if (cwv.lcp > 2.5) {
    const poor = cwv.lcp > 4;
    out.push({
      checkKey: "technical:cwv-lcp",
      pillar: "technical",
      title: `LCP ${cwv.lcp.toFixed(1)} s na mobile ${poor ? "— kritické" : "— nad limitom"}`,
      why: `Largest Contentful Paint je ${cwv.lcp.toFixed(1)} s, Google považuje za dobré ≤ 2,5 s${cwv.performance !== null ? ` (celkové performance skóre ${cwv.performance}/100)` : ""}. Core Web Vitals sú potvrdený ranking faktor a zároveň priamo zabíjajú konverzie — pri načítaní nad 3 s odchádza väčšina mobilných návštevníkov skôr, než web uvidí. Toto je najväčšia technická brzda, akú na webe máš.`,
      steps: [
        "Zisti LCP prvok: PageSpeed Insights → Diagnostika → „Largest Contentful Paint element“",
        "Ak je to obrázok: použi next/image s priority, správnou veľkosťou a formátom AVIF/WebP",
        "Predlož LCP obrázok cez <link rel=\"preload\">, nikdy ho nelazy-loaduj",
        "Odstráň render-blocking JS a CSS (next/script strategy=\"lazyOnload\" pre analytiku)",
        "Skontroluj fonty: font-display: swap a preload kritického fontu",
        "Cieľ: LCP pod 2,5 s na mobile",
      ],
      targetUrl: cwv.url,
      effortMin: 180,
      impact: 5,
      metric: "psi_lcp",
      metricScope: cwv.url,
      expectedNote: "LCP pod 2,5 s. Zlepšenie CWV sa v pozíciách prejaví do 4–8 týždňov, v konverziách okamžite.",
      verifyAfterDays: 28,
    });
  }

  if (cwv.cls !== null && cwv.cls > 0.1) {
    out.push({
      checkKey: "technical:cwv-cls",
      pillar: "technical",
      title: `CLS ${cwv.cls.toFixed(3)} — obsah poskakuje pri načítaní`,
      why: `Cumulative Layout Shift je ${cwv.cls.toFixed(3)}, dobré je ≤ 0,1. Používateľom sa posúva obsah pod prstom.`,
      steps: [
        "Každému <img> a <video> daj explicitné width a height (alebo aspect-ratio)",
        "Rezervuj miesto pre reklamy a embedy",
        "Fonty načítaj s font-display: optional alebo preloadni",
      ],
      targetUrl: cwv.url,
      effortMin: 60,
      impact: 3,
    });
  }

  return out;
}

// ------------------------------------------------------ Search Console

export interface GscSignals {
  queries: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

function gscChecks(g: GscSignals | null, crawl: CrawlResult): TaskDraft[] {
  if (!g || (!g.queries.length && !g.pages.length)) return [];
  const out: TaskDraft[] = [];

  // Striking distance: already on page 1-2, a nudge lands them in the top 3 where
  // ~90 % of the clicks live. Cheapest ranking gains that exist.
  const striking = g.queries
    .filter((q) => q.position >= 4 && q.position <= 15 && q.impressions >= 3)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);
  if (striking.length) {
    out.push({
      checkKey: "content:striking-distance",
      pillar: "content",
      title: `${striking.length} dopytov na dosah top 3 (pozícia 4–15)`,
      why:
        `Na tieto dopyty sa už zobrazuješ, len nízko — a pod pozíciou 3 klikne takmer nikto:\n` +
        striking.map((q) => `• „${q.key}“ — pozícia ${q.position.toFixed(1)}, ${q.impressions} impresií, ${q.clicks} klikov`).join("\n") +
        `\nPosunúť existujúcu stránku z 8. na 3. miesto je násobne lacnejšie než rankovať nový obsah od nuly.`,
      steps: [
        "Pre každý dopyt nájdi stránku, ktorá sa naň zobrazuje (Search Console → Výkonnosť → filter dopytu)",
        "Použi dopyt doslovne v title, H1 a prvom odseku",
        "Rozšír obsah tak, aby odpovedal na zámer za dopytom lepšie než top 3 výsledky",
        "Pridaj 2–3 interné odkazy na túto stránku s dopytom ako anchor textom",
        "Ak dopyt cieli inam než stránka ponúka, vytvor preň samostatnú stránku",
      ],
      effortMin: 120,
      impact: 5,
      metric: "gsc_clicks",
      expectedNote: `Posun do top 3 typicky znásobí kliky 5–10×. Aktuálne z ${striking.reduce((s, q) => s + q.impressions, 0)} impresií máš ${striking.reduce((s, q) => s + q.clicks, 0)} klikov.`,
      verifyAfterDays: 42,
    });
  }

  // Ranking well but nobody clicks → the SERP snippet is the problem, not the page.
  const crawled = new Set(crawl.pages.map((p) => p.url.replace(/\/$/, "")));
  const lowCtr = g.pages
    .filter((p) => crawled.has(p.key.replace(/\/$/, "")) && p.position <= 10 && p.impressions >= 10 && p.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
  if (lowCtr.length) {
    out.push({
      checkKey: "onpage:low-ctr-good-position",
      pillar: "onpage",
      title: `${lowCtr.length} stránok ranguje v top 10, ale takmer nikto neklikne`,
      why:
        lowCtr.map((p) => `• ${path(p.key)} — pozícia ${p.position.toFixed(1)}, ${p.impressions} impresií, CTR ${(p.ctr * 100).toFixed(1)} %`).join("\n") +
        `\nPri pozícii do 10 sa očakáva CTR 2–10 %. Nižšie číslo znamená, že title a description v SERP nepresvedčia — stránka je v poriadku, útržok nie.`,
      steps: [
        "Prepíš title: dopyt na začiatku + konkrétny benefit alebo číslo",
        "Prepíš description: čo návštevník získa, nie čo predávaš. Skonči výzvou k akcii",
        "Nesľubuj nič, čo na stránke nie je — vysoký bounce ti pozíciu zhorší",
        "Zmeraj o 4 týždne: CTR by malo stúpnuť aj bez zmeny pozície",
      ],
      targetUrl: lowCtr[0].key,
      effortMin: 45,
      impact: 4,
      metric: "gsc_ctr",
      metricScope: lowCtr[0].key,
      expectedNote: "CTR z pod 2 % na 3–6 % bez zmeny pozície.",
      verifyAfterDays: 28,
    });
  }

  return out;
}

/** Everything the crawl, PSI and Search Console together can prove. */
export function runChecks(
  crawl: CrawlResult,
  publishedPosts: number,
  cwv: CwvInput | null = null,
  gsc: GscSignals | null = null,
): TaskDraft[] {
  return [
    ...technicalChecks(crawl),
    ...cwvChecks(cwv),
    ...gscChecks(gsc, crawl),
    ...onPageChecks(crawl),
    ...schemaChecks(crawl),
    ...contentChecks(crawl, publishedPosts),
    ...localAndAuthorityChecks(),
  ];
}
