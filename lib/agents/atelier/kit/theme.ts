// Ateliér kit: téma (farby, fonty, tvar, textúra) a automatická oprava kontrastu.
// Kontrast textu sa strážia v KÓDE, nie v modeli: zlé farby od modelu sa dolaďujú tak,
// aby text bol vždy čitateľný.

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  /** druhá, doplnková farba (voliteľná) */
  accent2?: string;
}

export interface Theme {
  palette: Palette;
  fonts: {
    display: string;
    body: string;
    /** odkaz na Google Fonts (css2) pre oba fonty */
    href: string;
    displayWeight?: number;
    displayCase?: "none" | "upper";
    displayTracking?: number;
  };
  radius: "sharp" | "soft" | "pill";
  texture: "none" | "grain" | "paper" | "lines" | "dots";
  imageTreatment: "natural" | "duotone" | "mono-hover" | "warm";
  density: "airy" | "tight";
  /** grafické prvky, ktoré sa použijú naprieč stránkou */
  devices: ("dimension-lines" | "index-numbers" | "corner-marks" | "ticker" | "sticker")[];
}

const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v));

export function parseHex(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const toHex = (c: [number, number, number]) => "#" + c.map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("");

export function luminance(hex: string): number {
  const c = parseHex(hex) ?? [0, 0, 0];
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Posúva farbu textu smerom k čiernej/bielej, kým nemá aspoň `min` kontrast voči pozadiu. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (!parseHex(fg) || !parseHex(bg)) return fg;
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.5 ? "#000000" : "#ffffff";
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const c = mixHex(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

const FALLBACK: Palette = {
  bg: "#f4f1ea",
  surface: "#e8e4d9",
  ink: "#15170f",
  muted: "#5a5f50",
  accent: "#2f6b1a",
  accentInk: "#ffffff",
};

/** Doplní chýbajúce/zlé hodnoty a zaistí čitateľnosť. */
export function normalizeTheme(t: Partial<Theme> | undefined): Theme {
  const p = { ...FALLBACK, ...(t?.palette ?? {}) } as Palette;
  for (const k of ["bg", "surface", "ink", "muted", "accent", "accentInk"] as const) if (!parseHex(p[k])) p[k] = FALLBACK[k];
  if (p.accent2 && !parseHex(p.accent2)) delete p.accent2;
  p.ink = ensureContrast(p.ink, p.bg, 9);
  p.muted = ensureContrast(p.muted, p.bg, 4.6);
  p.accentInk = ensureContrast(p.accentInk, p.accent, 4.5);
  // akcent musí byť čitateľný aj ako text na pozadí (odkazy, popisky)
  const accentText = ensureContrast(p.accent, p.bg, 3.2);
  return {
    palette: { ...p, accent2: p.accent2 ?? accentText },
    fonts: {
      display: t?.fonts?.display || "Big Shoulders Display",
      body: t?.fonts?.body || "Instrument Sans",
      href:
        t?.fonts?.href ||
        "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700;800&family=Instrument+Sans:wght@400;500;600&display=swap",
      displayWeight: t?.fonts?.displayWeight ?? 700,
      displayCase: t?.fonts?.displayCase ?? "none",
      displayTracking: t?.fonts?.displayTracking ?? -0.02,
    },
    radius: t?.radius ?? "sharp",
    texture: t?.texture ?? "none",
    imageTreatment: t?.imageTreatment ?? "natural",
    density: t?.density ?? "airy",
    devices: t?.devices?.length ? t.devices : ["index-numbers", "corner-marks"],
  };
}

/** Text na akcentovej farbe použitý ako farba textu na svetlom pozadí (odkazy, čísla). */
export const accentText = (t: Theme) => ensureContrast(t.palette.accent, t.palette.bg, 3.2);
