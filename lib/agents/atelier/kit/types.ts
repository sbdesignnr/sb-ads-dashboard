// Ateliér kit: spoločné typy (špecifikácia stránky, ktorú vypĺňa model).
import type { Theme } from "./theme";

export interface Cta {
  label: string;
  href?: string;
}
export interface Fact {
  value: string;
  label: string;
}

export interface KitAssets {
  /** URL fotiek v poradí (indexy v špecifikácii sú 1-based); môžu byť aj data: URI */
  images: string[];
  logo?: string | null;
}

export type Ctx = { theme: Theme; assets: KitAssets; artSeed: number };

type Img = number | null;

export type Section =
  | { module: "hero"; variant?: "poster" | "split" | "fullbleed" | "statement" | "giant" | "mosaic" | "blueprint"; eyebrow?: string; title: string; titleAccent?: string; sub?: string; primary?: Cta; secondary?: Cta; img?: Img; imgs?: Img[]; facts?: Fact[]; meta?: { label?: string; lines: string[] }; stripLabels?: string[]; stamp?: { center?: string; ring: string } }
  | { module: "index"; eyebrow?: string; title: string; intro?: string; items: { title: string; text?: string; tag?: string }[] }
  | { module: "register"; eyebrow?: string; title: string; rows: { title: string; place?: string; value?: string; unit?: string; go?: string; tag?: string; img?: Img }[]; footLabel?: string; filters?: string[] }
  | { module: "gallery"; variant?: "grid" | "hscroll"; eyebrow?: string; title: string; items: { title: string; caption?: string; img?: Img }[] }
  | { module: "steps"; variant?: "line" | "stack"; eyebrow?: string; title: string; steps: { title: string; text?: string }[] }
  | { module: "quote"; eyebrow?: string; quote: string; author?: string; rating?: { value: string; label: string } }
  | { module: "stats"; items: Fact[] }
  | { module: "about"; eyebrow?: string; title: string; paragraphs: string[]; pull?: string; img?: Img }
  | { module: "team"; eyebrow?: string; title: string; people: { name: string; role?: string; phone?: string; email?: string }[] }
  | { module: "ticker"; items: string[] }
  | { module: "faq"; eyebrow?: string; title: string; items: { q: string; a: string }[] }
  | { module: "cta"; title: string; sub?: string; button: Cta }
  | { module: "contact"; eyebrow?: string; title: string; details: { label: string; value: string; href?: string }[]; form?: { title: string; fields: string[]; submit: string } }
  // ── nové: bohatšie moduly a funkcie na mieru podľa odboru ──
  | { module: "bento"; eyebrow?: string; title: string; tiles: { kind: "stat" | "text" | "img" | "quote"; size?: "s" | "m" | "l" | "w" | "t"; title?: string; text?: string; value?: string; label?: string; img?: Img }[] }
  | { module: "compare"; eyebrow?: string; title: string; before: string; after: string; img?: Img; img2?: Img }
  | { module: "calc"; eyebrow?: string; title: string; intro?: string; priceMin?: number; priceMax?: number; priceDefault?: number; unit?: string; years?: number; rate?: number; note?: string; cta?: Cta }
  | { module: "bodymap"; eyebrow?: string; title: string; intro?: string; areas: { id: "neck" | "shoulder" | "back" | "elbow" | "hip" | "knee" | "ankle" | "head"; title: string; text: string }[]; cta?: Cta }
  | { module: "configurator"; eyebrow?: string; title: string; intro?: string; groups: { label: string; options: string[] }[]; submit: string; href?: string }
  | { module: "booking"; eyebrow?: string; title: string; intro?: string; days?: string[]; slots: string[]; note?: string; cta?: Cta }
  | { module: "signature"; title?: string; html: string; css?: string; js?: string };

export interface FxFlags {
  /** rozdelenie nadpisov na slová s odhalením */
  split?: boolean;
  parallax?: boolean;
  counters?: boolean;
  progress?: boolean;
  cursor?: boolean;
  loader?: boolean;
  magnetic?: boolean;
  spotlight?: boolean;
  tilt?: boolean;
}

export interface PageSpec {
  theme?: Partial<Theme>;
  fx?: FxFlags;
  lang?: string;
  title?: string;
  description?: string;
  header?: { logoText: string; logoImg?: string | null; nav: Cta[]; cta?: Cta };
  sections: Section[];
  footer?: { mark: string; lines?: string[]; links?: Cta[] };
}
