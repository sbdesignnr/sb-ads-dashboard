// Čo SB Design REÁLNE ponúka a aké má referencie — zdroj: sbdesign.sk (repozitár
// sbdesign-web: lib/content.ts, lib/projects.ts). Agent smie ponúkať iba toto (alebo
// veci výslovne označené ako "mimo katalógu", ktoré musí Samuel schváliť) a odkazovať
// iba na tieto referencie — nič si nevymýšľa.

export const SERVICES = [
  {
    id: "web",
    name: "Web na mieru",
    what: "dizajn na mieru, vlastný kód (Next.js), rýchly web (PageSpeed 95+), plná responzívnosť, SEO základ, školenie a 30 dní podpory",
  },
  {
    id: "eshop",
    name: "E-shop",
    what: "Shopify / WooCommerce, platobné brány, napojenie na dopravcov, optimalizovaný checkout, analytika predaja",
  },
  {
    id: "ads",
    name: "Meta a Google Ads",
    what: "stratégia, nastavenie kampaní (Meta FB+IG, Google Search + PMax), reklamná kreatíva, A/B testovanie, mesačný reporting",
  },
] as const;

export const PROCESS =
  "bezplatná konzultácia → interaktívny prototyp (Figma) do 5-7 dní na schválenie → vývoj 10-21 dní → spustenie, školenie a 30 dní podpory";

/** Štartovacie ponuky, ktoré Samuel môže dodať s minimálnym rizikom pre klienta. Každá vyžaduje jeho schválenie pred odoslaním. */
export const STARTER_OFFERS = [
  "Jednostranový písomný rozbor zadarmo: tri konkrétne zmeny na ich webe alebo Google profile, ktoré by im priniesli najviac dopytov, s postupom (pošle sa do 2 pracovných dní od odpovede, stačí jedno slovo). Nič sa nevyrába vopred",
  "Krátka bezplatná konzultácia (15-20 minút, telefón alebo video): ukážem im konkrétny smer nového webu pre ich firmu a povieme si, či to pre nich dáva zmysel - bez záväzku (ponúkaj až po rozbore alebo ak sa o ňu sami pýtajú)",
  "Bezplatné opravenie JEDNEJ konkrétnej veci na ich webe/Google profile ako ukážka práce (napr. náhľad pri zdieľaní, popis stránky pre Google, kontaktný formulár, doplnenie Google profilu) - až po odpovedi",
  "Testovacia reklamná kampaň (Google/Meta) na jeden konkrétny dopyt v ich meste - nastavenie zadarmo, platia len reklamný rozpočet",
  "Bezplatný prototyp novej úvodnej stránky (Figma alebo klikateľný náhľad) do 5-7 dní, z ich vlastných textov a fotiek - pripravuje sa až keď prejavia záujem, nie vopred",
] as const;

export interface Reference {
  slug: string;
  client: string;
  industry: string;
  url: string; // verejná stránka projektu
  liveUrl: string;
}

const P = (slug: string, client: string, industry: string, liveUrl: string): Reference => ({
  slug,
  client,
  industry,
  url: `https://www.sbdesign.sk/projekty/${slug}`,
  liveUrl,
});

export const REFERENCES: Reference[] = [
  P("fyzioterapia", "Fyzioterapia pre každého", "Zdravie", "https://www.fyzioterapiaprekazdeho.sk"),
  P("propsyche", "ProPsyché - psychoterapia", "Zdravie & terapia", "https://www.propsyche.sk"),
  P("mukera", "Advokátska kancelária JUDr. Peter Múkera", "Právo", "https://www.mukera.sk"),
  P("advokat-kanaba", "Advokátska kancelária Kanaba", "Právo", "https://www.advokatkanaba.sk"),
  P("profinam", "Profinam - účtovníctvo", "Financie", "http://profinam.sk"),
  P("dubravsky", "Arch. Norbert Dúbravský", "Architektúra", "https://novy.dubravsky.sk"),
  P("zaar", "ZAAR - architektonická kancelária", "Architektúra", "https://www.zaartrnava.sk"),
  P("starea", "STAREA Reality", "Reality", "https://www.starea.sk"),
  P("lubica-bibenova", "Ľubica Bibeňová - reality", "Reality", "https://lubicabibenova.sk"),
  P("renata-kolencikova", "Renáta Kolenčíková - reality", "Reality", "https://www.renatakolencikova.com"),
  P("anima-residences", "Anima Residences", "Development", "https://www.animaresidences.sk"),
  P("penzion-naj", "Penzión & reštaurácia Karla Naj", "Hospitality", "https://www.penzionnaj.sk"),
  P("vytahy-barborik", "Výťahy Barborík", "Technické služby", "https://vytahybarborik.sk"),
  P("sunpool", "SunPool - bazény", "Stavebníctvo", "https://sunpool.sk"),
  P("upratujeme-nr", "Upratujeme NR", "Služby", "https://www.upratujemenr.sk"),
  P("zakladanie-firiem", "Zakladanie-firiem.sk", "Firemné služby", "https://zakladanie-firiem.sk"),
];

/** Referencie z rovnakého (alebo príbuzného) odboru ako segment leadu. */
export function referencesFor(segmentName: string): Reference[] {
  const n = segmentName.toLowerCase();
  const pick = (...slugs: string[]) => REFERENCES.filter((r) => slugs.includes(r.slug));
  if (/fyzio|lekár|zubn|doktor|ordinác|terapi|psycho|wellness|masáž/.test(n))
    return pick("fyzioterapia", "propsyche");
  if (/advok|notár|právn/.test(n)) return pick("mukera", "advokat-kanaba");
  if (/účtovn|daň|audit/.test(n)) return pick("profinam", "zakladanie-firiem");
  if (/architekt|dizajn/.test(n)) return pick("dubravsky", "zaar");
  if (/realit|nehnute/.test(n)) return pick("starea", "lubica-bibenova", "renata-kolencikova");
  if (/hotel|ubytov|penzión|reštaur|kaviar|gastro/.test(n)) return pick("penzion-naj");
  if (/staveb|stavb|remesl|rekonštr|rekonstr|bazén|inštal|výťah/.test(n)) return pick("sunpool", "vytahy-barborik");
  if (/upratov|služb/.test(n)) return pick("upratujeme-nr");
  return [];
}
