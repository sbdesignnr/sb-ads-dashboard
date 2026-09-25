// Nora: znalostná báza o predaji a psychológii adresáta. Je to VŠEOBECNÁ znalosť (nie tvrdenie
// o konkrétnej firme): pomáha vybrať uhol, tón a jednu vetu, ktorá zmierni námietku. Fakty o
// firme smú do mailu ísť iba z overených zistení.

/** Zásady prvého kontaktného mailu majiteľovi malej firmy (SK/CZ). */
export const SALES_PRINCIPLES = `ZÁSADY PREDAJA A PSYCHOLÓGIE ADRESÁTA (všeobecná znalosť, nie fakty o firme)
1. Adresát je vyťažený majiteľ, číta na mobile medzi dvoma prácami. O tom, či mail otvorí a prečíta, rozhodne za 3 sekundy predmet a prvá veta. Predmet má vyzerať ako od kolegu: krátky, malé písmená, bez marketingových slov.
2. Dôveryhodnosť vzniká ŠPECIFICKOSŤOU: detail, ktorý hromadný mailer nenapíše a ktorý si majiteľ overí jedným pohľadom. Všeobecné komplimenty a všeobecné „váš web“ ju ničia.
3. RECIPROCITA je najsilnejší nástroj: hotová vec zadarmo (návrh, ukážka) predtým, než čokoľvek pýtame. Nežiadaj hodinu času ani „call“; pýtaj jedno slovo odpovede alebo jeden klik.
4. Znižuj trenie: jedna akcia, žiadna voľba. Väčší krok (stretnutie, cenník) prichádza až po odpovedi.
5. Predvídaj najpravdepodobnejšiu námietku a zmierni ju JEDNOU vetou vecne (nie obranne): „už máme web“ -> nejde o výmenu naslepo, vidia hotovú ukážku; „nemám čas“ -> nič nemusia robiť; „je to drahé“ -> ukážka je zadarmo, o peniazoch sa hovorí až keď sa páči.
6. Autonómia: nechaj ich slobodne rozhodnúť („ak nie, nič sa nedeje“). Tlak vyvoláva odpor (reaktancia).
7. Sociálny dôkaz iba REÁLNY (referencia z ich odboru). Nikdy vymyslené čísla, „stovky klientov“, falošná naliehavosť, „posledné miesta“, lichôtky.
8. Nekritizuj ostro („váš web je zlý“ spúšťa obranu vlastného ega). Ukazuj PRÍLEŽITOSŤ a hrdosť na ich prácu: web má ukazovať to, čo reálne robia a v čom sú dobrí.
9. Strach a strata sú pri prvom kontakte slabé a pôsobia manipulatívne; funguje zvedavosť a konkrétna hotová vec.
10. Tón: pokojný, priamy, ako remeselník remeselníkovi. Nič nepredáva, ukazuje. Jeden mail = jedna myšlienka = jedna akcia.`;

export interface NicheCard {
  match: RegExp;
  name: string;
  card: string;
}

const NICHES: NicheCard[] = [
  {
    match: /realit|nehnute/i,
    name: "realitné kancelárie",
    card: `ADRESÁT: majiteľ kancelárie alebo maklér (často sólista či malý tím), platený z provízie, jeho „produkt“ je dôvera. Predávajúci si vyberá makléra podľa toho, ako bude prezentovať jeho nehnuteľnosť a či pôsobí dôveryhodne.
MOTIVÁCIE: viac exkluzívnych mandátov, rýchlejší predaj, silná osobná značka, odlíšenie od portálov (nehnutelnosti.sk, reality.sk), na ktorých sú všetci zameniteľní.
OBAVY A NÁMIETKY: „ponuky máme na portáloch“, „klienti chodia z odporúčania“, strach z drahého webu bez efektu.
ČO HO ZAUJME: vlastný web ako značka a zdroj mandátov (nie ďalší výpis ponúk), prezentácia projektov a maklérov, kalkulačka splátky, kvalitné fotky a rýchly web na mobile.
SIGNÁLY DÔVERY: mená maklérov, reálne ponuky, recenzie, roky na trhu (iba ak sú v dôkazoch).`,
  },
  {
    match: /stav|rekonštr|remesl|bazén|inštal/i,
    name: "stavebné firmy a rekonštrukcie",
    card: `ADRESÁT: majiteľ, ktorý je zároveň stavbyvedúci; málo času pri počítači, vybavuje telefóny a ponuky. Zákazník si vyberá podľa dôvery a dôkazov, že firma to naozaj vie (fotky realizácií, referencie), nielen podľa ceny.
MOTIVÁCIE: kvalitnejšie dopyty (vážni záujemcovia namiesto porovnávačov cien), menej zbytočných telefonátov, dôveryhodnosť voči veľkým zákazkám.
OBAVY A NÁMIETKY: „zákazky máme z odporúčania“, „web nám nič nedá“, skúsenosť s webmi, ktoré sľubovali a nič nepriniesli.
ČO HO ZAUJME: galéria realizácií s detailom, formulár, ktorý predfiltruje záujemcu (typ práce, rozsah, termín), rýchly web na mobile (zákazníci hľadajú z telefónu), jasné „ako prebieha spolupráca“.
SIGNÁLY DÔVERY: reálne fotky realizácií, certifikáty, roky činnosti, rozsah služieb (iba ak sú v dôkazoch).`,
  },
  {
    match: /fyzio|zdrav|lekár|ordin|terap|masáž|wellness/i,
    name: "fyzioterapia a zdravie",
    card: `ADRESÁT: fyzioterapeut alebo majiteľ ordinácie; pracuje rukami, administratíva ho ruší. Pacient vyberá podľa dôvery, špecializácie a toho, či sa vie jednoducho objednať.
MOTIVÁCIE: plný kalendár bez telefonátov v čase terapie, správni pacienti (konkrétny problém), dôvera a ľudský dojem, menej vypadnutých termínov.
OBAVY A NÁMIETKY: „pacienti chodia z odporúčania“, „nemám čas“, strach z toho, že web bude znieť komerčne a nie ľudsky.
ČO HO ZAUJME: online objednanie, jasné vysvetlenie ako prebieha prvé sedenie, kto ošetruje (tvár a kvalifikácia), stránky podľa problému (chrbtica, koleno), teplý a pokojný tón.
SIGNÁLY DÔVERY: mená a vzdelanie terapeutov, špecializácie, recenzie pacientov (iba ak sú v dôkazoch).`,
  },
];

const GENERIC: NicheCard = {
  match: /./,
  name: "malá firma",
  card: `ADRESÁT: majiteľ malej firmy, ktorý robí všetko sám. Vyberá si dodávateľov podľa dôvery a konkrétnej ukážky.
MOTIVÁCIE: viac vhodných dopytov, menej zdržania, dobrý dojem u zákazníka.
OBAVY A NÁMIETKY: „už máme web“, „nemám čas“, „je to drahé“.
ČO HO ZAUJME: hotová konkrétna ukážka z jeho vlastného materiálu, nič, čo by od neho vyžadovalo prácu.`,
};

export function nicheCard(segmentName: string): NicheCard {
  return NICHES.find((n) => n.match.test(segmentName)) ?? GENERIC;
}

/** Uhly, z ktorých sa vyberajú varianty mailu (každý stojí na inom overenom zistení). */
export const ANGLES = [
  { id: "hotova-vec", label: "Hotová vec zadarmo", how: "Otvor tým, že už niečo urobil PRE NICH (návrh z ich materiálu), a povedz 1 konkrétnu vec, ktorú ukazuje. Reciprocita." },
  { id: "hlas-zakaznikov", label: "Hlas zákazníkov", how: "Otvor tým, čo o nich píšu zákazníci v recenziách (iba doslovne overené), a že to na webe nie je vidieť. Hrdosť na vlastnú prácu." },
  { id: "konkurenti", label: "Porovnanie v meste", how: "Otvor konkrétnym porovnaním s konkurentmi v ich meste (iba overené číslo). Mierne a vecne, bez kritiky." },
  { id: "rozpor", label: "Rozpor", how: "Otvor rozporom medzi tým, čo o sebe tvrdia, a tým, čo web ukazuje. Zvedavosť, nie výčitka." },
  { id: "detail", label: "Konkrétny detail", how: "Otvor jedným konkrétnym nálezom z ich webu, ktorý si overia jedným pohľadom. Špecifickosť = dôvera." },
] as const;

export type AngleId = (typeof ANGLES)[number]["id"];
