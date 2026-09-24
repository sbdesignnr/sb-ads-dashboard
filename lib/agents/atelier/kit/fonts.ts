// Ateliér kit: overené dvojice písiem (Google Fonts). Model vyberá id, odkaz dopĺňa kód,
// takže nikdy nevznikne neplatný odkaz alebo neexistujúci font.
export interface FontPair {
  id: string;
  display: string;
  body: string;
  href: string;
  /** krátky popis charakteru pre výber modelom */
  feel: string;
  displayWeight: number;
}

const g = (families: string) => `https://fonts.googleapis.com/css2?${families}&display=swap`;

export const FONT_PAIRS: FontPair[] = [
  { id: "industrial", display: "Big Shoulders Display", body: "Instrument Sans", displayWeight: 800, feel: "úzky architektonický grotesk, vecný, stavebný, technický, tabuľkový", href: g("family=Big+Shoulders+Display:wght@500;700;800&family=Instrument+Sans:wght@400;500;600") },
  { id: "editorial-serif", display: "Fraunces", body: "Instrument Sans", displayWeight: 600, feel: "výrazný moderný serif s charakterom, redakčný, ľudský, teplý", href: g("family=Fraunces:wght@400;600;800&family=Instrument+Sans:wght@400;500;600") },
  { id: "elegant-serif", display: "Instrument Serif", body: "Inter Tight", displayWeight: 400, feel: "elegantný jemný serif, luxusný, pokojný, prémiový", href: g("family=Instrument+Serif&family=Inter+Tight:wght@400;500;600") },
  { id: "poster", display: "Anton", body: "Work Sans", displayWeight: 400, feel: "hutný plagátový grotesk, hlasný, odvážny, športový", href: g("family=Anton&family=Work+Sans:wght@400;500;600") },
  { id: "contemporary", display: "Syne", body: "DM Sans", displayWeight: 800, feel: "súčasný, kreatívny, netradičný, mierne excentrický", href: g("family=Syne:wght@500;700;800&family=DM+Sans:wght@400;500;600") },
  { id: "warm-grotesk", display: "Bricolage Grotesque", body: "Figtree", displayWeight: 700, feel: "priateľský moderný grotesk s osobnosťou, ľudský, prístupný", href: g("family=Bricolage+Grotesque:wght@500;700;800&family=Figtree:wght@400;500;600") },
  { id: "classic", display: "Playfair Display", body: "Source Sans 3", displayWeight: 700, feel: "klasický kontrastný serif, dôveryhodný, tradičný, právny/finančný", href: g("family=Playfair+Display:wght@500;700;800&family=Source+Sans+3:wght@400;500;600") },
  { id: "tech", display: "Space Grotesk", body: "IBM Plex Sans", displayWeight: 700, feel: "technický geometrický grotesk, presný, digitálny, inžiniersky", href: g("family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600") },
  { id: "soft-display", display: "DM Serif Display", body: "DM Sans", displayWeight: 400, feel: "mäkký kontrastný serif, zdravie, wellness, starostlivosť", href: g("family=DM+Serif+Display&family=DM+Sans:wght@400;500;600") },
  { id: "bold-round", display: "Unbounded", body: "Manrope", displayWeight: 700, feel: "široký zaoblený display, energický, moderný, mladý", href: g("family=Unbounded:wght@500;700;900&family=Manrope:wght@400;500;600") },
  { id: "luxury", display: "Cormorant Garamond", body: "Jost", displayWeight: 600, feel: "jemný luxusný garamond, realitný prémium, hotelierstvo", href: g("family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600") },
];

export const fontPair = (id?: string) => FONT_PAIRS.find((f) => f.id === id) ?? FONT_PAIRS[0];
