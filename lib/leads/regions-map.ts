// Odvodenie kraja z mesta leadu. Leady majú uložené `companyCity` (z Google
// Places), ale nie kraj — tu ho dopočítame. Deterministické: mesto patrí do
// práve jedného kraja. Pokrýva okresné mestá + väčšie obce SK a väčšie mestá ČR;
// neznáme (malé obce) vrátia null a v UI spadnú pod „Neznámy kraj".

// Kanonické názvy krajov (rovnaké ako v skenovaní `google-places.ts`). Držíme ich
// tu natvrdo, aby tento modul nezávisel od google-places — inak by sa server-only
// kód (node:fs) dostal do klientskeho balíka cez šablóny.
export const SK_KRAJE = [
  "Bratislavský kraj",
  "Trnavský kraj",
  "Trenčiansky kraj",
  "Nitriansky kraj",
  "Žilinský kraj",
  "Banskobystrický kraj",
  "Prešovský kraj",
  "Košický kraj",
];
export const CZ_KRAJE = [
  "Praha",
  "Středočeský kraj",
  "Jihočeský kraj",
  "Plzeňský kraj",
  "Karlovarský kraj",
  "Ústecký kraj",
  "Liberecký kraj",
  "Královéhradecký kraj",
  "Pardubický kraj",
  "Kraj Vysočina",
  "Jihomoravský kraj",
  "Olomoucký kraj",
  "Zlínský kraj",
  "Moravskoslezský kraj",
];
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

// ── Lokál mesta („v Košiciach") ──────────────────────────────────────────────
// Slovenský lokál je nepravidelný, preto máme ručný zoznam pre reálne mestá +
// heuristiku pre zvyšok. Hodnota obsahuje aj predložku (v / vo).

const CITY_LOCATIVE: Record<string, string> = {};
const L = (city: string, form: string) => {
  CITY_LOCATIVE[norm(city)] = form;
};
L("Bratislava", "v Bratislave");
L("Malacky", "v Malackách");
L("Pezinok", "v Pezinku");
L("Senec", "v Senci");
L("Stupava", "v Stupave");
L("Svätý Jur", "vo Svätom Jure");
L("Modra", "v Modre");
L("Trnava", "v Trnave");
L("Dunajská Streda", "v Dunajskej Strede");
L("Galanta", "v Galante");
L("Hlohovec", "v Hlohovci");
L("Piešťany", "v Piešťanoch");
L("Senica", "v Senici");
L("Skalica", "v Skalici");
L("Sereď", "v Seredi");
L("Holíč", "v Holíči");
L("Šamorín", "v Šamoríne");
L("Trenčín", "v Trenčíne");
L("Prievidza", "v Prievidzi");
L("Nové Mesto nad Váhom", "v Novom Meste nad Váhom");
L("Považská Bystrica", "v Považskej Bystrici");
L("Púchov", "v Púchove");
L("Partizánske", "v Partizánskom");
L("Dubnica nad Váhom", "v Dubnici nad Váhom");
L("Handlová", "v Handlovej");
L("Bojnice", "v Bojniciach");
L("Bánovce nad Bebravou", "v Bánovciach nad Bebravou");
L("Nováky", "v Novákoch");
L("Myjava", "na Myjave");
L("Nitra", "v Nitre");
L("Nové Zámky", "v Nových Zámkoch");
L("Komárno", "v Komárne");
L("Levice", "v Leviciach");
L("Šaľa", "v Šali");
L("Topoľčany", "v Topoľčanoch");
L("Zlaté Moravce", "v Zlatých Moravciach");
L("Štúrovo", "v Štúrove");
L("Šurany", "v Šuranoch");
L("Vráble", "vo Vrábľoch");
L("Žilina", "v Žiline");
L("Martin", "v Martine");
L("Čadca", "v Čadci");
L("Dolný Kubín", "v Dolnom Kubíne");
L("Liptovský Mikuláš", "v Liptovskom Mikuláši");
L("Ružomberok", "v Ružomberku");
L("Námestovo", "v Námestove");
L("Kysucké Nové Mesto", "v Kysuckom Novom Meste");
L("Bytča", "v Bytči");
L("Tvrdošín", "v Tvrdošíne");
L("Trstená", "v Trstenej");
L("Vrútky", "vo Vrútkach");
L("Terchová", "v Terchovej");
L("Rajec", "v Rajci");
L("Liptovský Hrádok", "v Liptovskom Hrádku");
L("Turčianske Teplice", "v Turčianskych Tepliciach");
L("Banská Bystrica", "v Banskej Bystrici");
L("Zvolen", "vo Zvolene");
L("Žiar nad Hronom", "v Žiari nad Hronom");
L("Lučenec", "v Lučenci");
L("Rimavská Sobota", "v Rimavskej Sobote");
L("Brezno", "v Brezne");
L("Detva", "v Detve");
L("Krupina", "v Krupine");
L("Revúca", "v Revúcej");
L("Veľký Krtíš", "vo Veľkom Krtíši");
L("Banská Štiavnica", "v Banskej Štiavnici");
L("Nová Baňa", "v Novej Bani");
L("Fiľakovo", "vo Fiľakove");
L("Prešov", "v Prešove");
L("Poprad", "v Poprade");
L("Humenné", "v Humennom");
L("Bardejov", "v Bardejove");
L("Kežmarok", "v Kežmarku");
L("Stará Ľubovňa", "v Starej Ľubovni");
L("Snina", "v Snine");
L("Svidník", "vo Svidníku");
L("Vranov nad Topľou", "vo Vranove nad Topľou");
L("Sabinov", "v Sabinove");
L("Levoča", "v Levoči");
L("Stropkov", "v Stropkove");
L("Svit", "vo Svite");
L("Vysoké Tatry", "vo Vysokých Tatrách");
L("Štrba", "v Štrbe");
L("Košice", "v Košiciach");
L("Michalovce", "v Michalovciach");
L("Spišská Nová Ves", "v Spišskej Novej Vsi");
L("Trebišov", "v Trebišove");
L("Rožňava", "v Rožňave");
L("Sobrance", "v Sobranciach");
L("Gelnica", "v Gelnici");
L("Moldava nad Bodvou", "v Moldave nad Bodvou");
L("Kráľovský Chlmec", "v Kráľovskom Chlmci");
L("Medzev", "v Medzeve");
L("Praha", "v Prahe");
L("Brno", "v Brne");
L("Ostrava", "v Ostrave");
L("Plzeň", "v Plzni");
L("Liberec", "v Liberci");
L("Olomouc", "v Olomouci");
L("Zlín", "v Zlíne");
L("Karlovy Vary", "v Karlových Varoch");

/**
 * Mesto v lokáli s predložkou, napr. „v Košiciach", „vo Zvolene". Známe mestá
 * z ručného zoznamu; pre ostatné jednoduchá heuristika. Keď si istá nie je,
 * vráti „v <mesto>".
 */
export function cityLocative(city: string | null | undefined): string {
  if (!city) return "";
  const clean = city.replace(/\s+[IVX]+$/i, "").trim(); // odstráň mestskú časť „Košice I"
  const key = norm(clean);
  if (CITY_LOCATIVE[key]) return CITY_LOCATIVE[key];

  const lower = clean.toLowerCase();
  if (/ov$/.test(lower)) return `v ${clean}e`; // Prešov → v Prešove
  if (/[íi]n$/.test(lower)) return `v ${clean}e`; // Trenčín → v Trenčíne
  if (/ok$/.test(lower)) return `v ${clean.slice(0, -2)}ku`; // Ružomberok → v Ružomberku
  if (/ca$/.test(lower)) return `v ${clean.slice(0, -1)}i`; // Senica → v Senici
  if (/[čšž]a$/.test(lower)) return `v ${clean.slice(0, -1)}i`; // Bytča → v Bytči
  if (/a$/.test(lower)) return `v ${clean.slice(0, -1)}e`; // Nitra → v Nitre
  if (/o$/.test(lower)) return `v ${clean.slice(0, -1)}e`; // Brezno → v Brezne
  return `v ${clean}`;
}
