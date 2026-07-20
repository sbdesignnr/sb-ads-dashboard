// Odvodenie kraja z mesta leadu. Leady majú uložené `companyCity` (z Google
// Places), ale nie kraj — tu ho dopočítame. Deterministické: mesto patrí do
// práve jedného kraja. Pokrýva okresné mestá + väčšie obce SK a väčšie mestá ČR;
// neznáme (malé obce) vrátia null a v UI spadnú pod „Neznámy kraj".

import { SK_REGIONS, CZ_REGIONS } from "./google-places";

/** Kanonické názvy krajov (rovnaké ako v skenovaní). */
export const SK_KRAJE = SK_REGIONS.map((r) => r.name);
export const CZ_KRAJE = CZ_REGIONS.map((r) => r.name);
export const ALL_KRAJE = [...SK_KRAJE, ...CZ_KRAJE];

// Mestá/obce → kraj. Kľúče píšeme čitateľne; normalizujú sa pri načítaní modulu.
const KRAJ_TOWNS: Record<string, string[]> = {
  // ── SK ── (okresné mestá + obce, ktoré sa reálne vyskytli v leadoch)
  "Bratislavský kraj": [
    "Bratislava",
    "Malacky",
    "Pezinok",
    "Senec",
    "Stupava",
    "Svätý Jur",
    "Modra",
    "Kráľová pri Senci",
    "Miloslavov",
    "Limbach",
    "Rovinka",
    "Tomášov",
    "Ivanka pri Dunaji",
    "Bernolákovo",
  ],
  "Trnavský kraj": [
    "Trnava",
    "Dunajská Streda",
    "Galanta",
    "Hlohovec",
    "Piešťany",
    "Senica",
    "Skalica",
    "Sereď",
    "Holíč",
    "Gbely",
    "Šamorín",
    "Veľký Meder",
    "Vrbové",
    "Leopoldov",
    "Malé Dvorníky",
    "Štvrtok na Ostrove",
    "Dolné Saliby",
    "Opoj",
  ],
  "Trenčiansky kraj": [
    "Trenčín",
    "Prievidza",
    "Nové Mesto nad Váhom",
    "Považská Bystrica",
    "Púchov",
    "Bánovce nad Bebravou",
    "Ilava",
    "Myjava",
    "Partizánske",
    "Dubnica nad Váhom",
    "Nováky",
    "Handlová",
    "Bojnice",
    "Stará Turá",
    "Nemšová",
    "Lazy pod Makytou",
  ],
  "Nitriansky kraj": [
    "Nitra",
    "Nové Zámky",
    "Komárno",
    "Levice",
    "Šaľa",
    "Topoľčany",
    "Zlaté Moravce",
    "Štúrovo",
    "Šurany",
    "Vráble",
    "Želiezovce",
    "Hurbanovo",
    "Kolárovo",
    "Tlmače",
    "Nesvady",
    "Výčapy - Opatovce",
    "Rišňovce",
    "Jasová",
    "Štitáre",
  ],
  "Žilinský kraj": [
    "Žilina",
    "Martin",
    "Čadca",
    "Dolný Kubín",
    "Liptovský Mikuláš",
    "Ružomberok",
    "Námestovo",
    "Turčianske Teplice",
    "Kysucké Nové Mesto",
    "Bytča",
    "Tvrdošín",
    "Trstená",
    "Rajec",
    "Vrútky",
    "Krásno nad Kysucou",
    "Turany",
    "Liptovský Hrádok",
    "Demänovská Dolina",
    "Bitarová",
    "Oravská Lesná",
    "Zákamenné",
    "Zázrivá",
    "Lisková",
    "Ivachnová",
    "Hruštín",
    "Pavčina Lehota",
    "Galovany",
    "Pribylina",
    "Terchová",
    "Rosina",
  ],
  "Banskobystrický kraj": [
    "Banská Bystrica",
    "Zvolen",
    "Žiar nad Hronom",
    "Lučenec",
    "Rimavská Sobota",
    "Brezno",
    "Detva",
    "Krupina",
    "Poltár",
    "Revúca",
    "Veľký Krtíš",
    "Banská Štiavnica",
    "Nová Baňa",
    "Fiľakovo",
    "Hriňová",
    "Selce",
    "Veľké Teriakovce",
    "Mýto pod Ďumbierom",
    "Ladomerská Vieska",
    "Donovaly",
    "Lehôtka pod Brehmi",
    "Závadka nad Hronom",
  ],
  "Prešovský kraj": [
    "Prešov",
    "Poprad",
    "Humenné",
    "Bardejov",
    "Kežmarok",
    "Stará Ľubovňa",
    "Snina",
    "Svidník",
    "Vranov nad Topľou",
    "Sabinov",
    "Levoča",
    "Stropkov",
    "Medzilaborce",
    "Lipany",
    "Spišská Belá",
    "Spišská Stará Ves",
    "Vysoké Tatry",
    "Svit",
    "Sveržov",
    "Giraltovce",
    "Štrba",
    "Sedliská",
    "Ždiar",
    "Brezovica",
  ],
  "Košický kraj": [
    "Košice",
    "Michalovce",
    "Spišská Nová Ves",
    "Trebišov",
    "Rožňava",
    "Sobrance",
    "Gelnica",
    "Moldava nad Bodvou",
    "Kráľovský Chlmec",
    "Dobšiná",
    "Medzev",
    "Strážske",
    "Veľké Kapušany",
    "Čierna nad Tisou",
    "Dvorníky - Včeláre",
    "Mlynky",
  ],
  // ── CZ ──
  Praha: ["Praha"],
  "Středočeský kraj": [
    "Kladno",
    "Mladá Boleslav",
    "Příbram",
    "Kolín",
    "Kutná Hora",
    "Mělník",
    "Beroun",
    "Benešov",
    "Rakovník",
    "Nymburk",
    "Brandýs nad Labem",
  ],
  "Jihočeský kraj": [
    "České Budějovice",
    "Tábor",
    "Písek",
    "Strakonice",
    "Jindřichův Hradec",
    "Český Krumlov",
    "Prachatice",
  ],
  "Plzeňský kraj": ["Plzeň", "Klatovy", "Rokycany", "Domažlice", "Tachov"],
  "Karlovarský kraj": ["Karlovy Vary", "Cheb", "Sokolov", "Ostrov"],
  "Ústecký kraj": [
    "Ústí nad Labem",
    "Most",
    "Děčín",
    "Teplice",
    "Chomutov",
    "Litoměřice",
    "Louny",
    "Litvínov",
  ],
  "Liberecký kraj": ["Liberec", "Jablonec nad Nisou", "Česká Lípa", "Turnov"],
  "Královéhradecký kraj": [
    "Hradec Králové",
    "Trutnov",
    "Náchod",
    "Jičín",
    "Rychnov nad Kněžnou",
  ],
  "Pardubický kraj": [
    "Pardubice",
    "Chrudim",
    "Svitavy",
    "Ústí nad Orlicí",
    "Česká Třebová",
  ],
  "Kraj Vysočina": [
    "Jihlava",
    "Třebíč",
    "Žďár nad Sázavou",
    "Havlíčkův Brod",
    "Pelhřimov",
  ],
  "Jihomoravský kraj": [
    "Brno",
    "Znojmo",
    "Břeclav",
    "Hodonín",
    "Vyškov",
    "Blansko",
    "Kyjov",
  ],
  "Olomoucký kraj": [
    "Olomouc",
    "Přerov",
    "Prostějov",
    "Šumperk",
    "Hranice",
    "Jeseník",
  ],
  "Zlínský kraj": [
    "Zlín",
    "Kroměříž",
    "Uherské Hradiště",
    "Vsetín",
    "Valašské Meziříčí",
    "Otrokovice",
  ],
  "Moravskoslezský kraj": [
    "Ostrava",
    "Havířov",
    "Karviná",
    "Frýdek-Místek",
    "Opava",
    "Nový Jičín",
    "Třinec",
    "Krnov",
    "Bohumín",
  ],
};

/** malé písmená, bez diakritiky, zjednotené medzery. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalizovaná vyhľadávacia tabuľka mesto → kraj.
const CITY_TO_KRAJ: Record<string, string> = {};
for (const [kraj, towns] of Object.entries(KRAJ_TOWNS)) {
  for (const t of towns) CITY_TO_KRAJ[norm(t)] = kraj;
}

/**
 * Kraj pre dané mesto. Skúša presnú zhodu, potom odstráni rímsku príponu mestskej
 * časti („Košice I" → „Košice"), nakoniec prvé slovo pred pomlčkou/medzerou
 * („Bratislava-Vrakuňa" → „Bratislava"). Neznáme mesto → null.
 */
export function krajForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const base = norm(city);
  if (CITY_TO_KRAJ[base]) return CITY_TO_KRAJ[base];
  const noRoman = base.replace(/\s+[ivx]+$/, "").trim();
  if (CITY_TO_KRAJ[noRoman]) return CITY_TO_KRAJ[noRoman];
  const head = noRoman.split(/[-\s]/)[0];
  if (head && CITY_TO_KRAJ[head]) return CITY_TO_KRAJ[head];
  return null;
}

/** Záloha: nájde názov kraja priamo v adrese (občas tam je). */
export function krajFromAddress(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  const a = norm(address);
  for (const kraj of ALL_KRAJE) {
    if (a.includes(norm(kraj))) return kraj;
  }
  return null;
}

/** Najlepší odhad kraja z údajov leadu: mesto → adresa → null. */
export function krajForLead(lead: {
  companyCity?: string | null;
  companyAddress?: string | null;
}): string | null {
  return krajForCity(lead.companyCity) ?? krajFromAddress(lead.companyAddress);
}
