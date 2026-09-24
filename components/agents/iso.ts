// Izometrická geometria pre svet agentov: mriežka 2:1, farby a radenie podľa hĺbky.

export const TW = 96; // šírka dlaždice v px
export const TH = 48; // výška dlaždice v px
export const N = 14; // ostrov je N×N dlaždíc

export type Pt = [number, number];

/** mriežka (gx, gy, výška z v px) → súradnice scény */
export const iso = (gx: number, gy: number, z = 0): Pt => [
  ((gx - gy) * TW) / 2,
  ((gx + gy) * TH) / 2 - z,
];

const r1 = (v: number) => Math.round(v * 10) / 10;
export const P = (pts: Pt[]) => pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");

/** pôdorys obdĺžnika v mriežke ako polygon (na zemi alebo vo výške z) */
export const footprint = (gx: number, gy: number, w: number, d: number, z = 0) =>
  P([iso(gx, gy, z), iso(gx + w, gy, z), iso(gx + w, gy + d, z), iso(gx, gy + d, z)]);

/** elipsa, do ktorej sa zobrazí kruh polomeru r (v dlaždiciach) */
export const circleRx = (r: number) => r * ((TW / 2) * Math.SQRT2);
export const circleRy = (r: number) => r * ((TH / 2) * Math.SQRT2);

// ── farby ──────────────────────────────────────────────────────────────────

const hex = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const toHex = (c: [number, number, number]) =>
  "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
export const darken = (c: string, t: number) => mix(c, "#000000", t);

/** deterministický pseudonáhodný generátor (scéna vyzerá pri každom načítaní rovnako) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── radenie podľa hĺbky (painter's algorithm) ─────────────────────────────

/** Ohraničenie objektu v mriežke; bod má x0==x1 a y0==y1. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * true, ak je `a` bližšie k divákovi než `b` (kreslí sa neskôr).
 * Diváka vidíme z kladných smerov gx aj gy, preto je `a` vpredu, ak leží celé
 * na strane väčšieho gx alebo väčšieho gy než `b`.
 */
const inFront = (a: Bounds, b: Bounds) => a.x0 >= b.x1 || a.y0 >= b.y1;

/** Topologické radenie zozadu dopredu; nerozhodnuté dvojice sa radia podľa stredu. */
export function depthSort<T extends { key: string; b: Bounds }>(items: T[]): T[] {
  const n = items.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i].b;
      const b = items[j].b;
      const aFront = inFront(a, b);
      const bFront = inFront(b, a);
      if (aFront && !bFront) {
        out[j].push(i);
        indeg[i]++;
      } else if (bFront && !aFront) {
        out[i].push(j);
        indeg[j]++;
      }
    }
  }
  const centre = (i: number) => items[i].b.x0 + items[i].b.x1 + items[i].b.y0 + items[i].b.y1;
  const ready = items.map((_, i) => i).filter((i) => indeg[i] === 0);
  const res: T[] = [];
  const done = new Array(n).fill(false);
  while (res.length < n) {
    if (!ready.length) {
      // cyklus: vezmi najvzdialenejší zo zvyšných
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || centre(i) < centre(best))) best = i;
      ready.push(best);
    }
    ready.sort((p, q) => centre(q) - centre(p));
    const i = ready.pop()!;
    if (done[i]) continue;
    done[i] = true;
    res.push(items[i]);
    for (const j of out[i]) if (--indeg[j] === 0 && !done[j]) ready.push(j);
  }
  return res;
}
