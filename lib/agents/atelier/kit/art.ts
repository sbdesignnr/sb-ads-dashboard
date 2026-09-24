// Ateliér kit: vektorová "grafika" pre prípady, keď firma nemá použiteľné fotky.
// Deterministické (rovnaký seed = rovnaký výsledok), kreslené farbami témy.
import { mixHex, type Palette } from "./theme";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type ArtKind = "topo" | "grid" | "hatch" | "dots" | "waves" | "blocks";
const KINDS: ArtKind[] = ["topo", "grid", "waves", "blocks", "hatch", "dots"];
export const pickArt = (n: number): ArtKind => KINDS[Math.abs(n) % KINDS.length];

const W = 800;
const H = 500;

function topo(r: () => number, ink: string, accent: string): string {
  const cx = 250 + r() * 300;
  const cy = 150 + r() * 200;
  const ph = [r() * 6, r() * 6, r() * 6];
  const a = [0.12 + r() * 0.1, 0.08 + r() * 0.08, 0.05 + r() * 0.05];
  let out = "";
  for (let i = 0; i < 14; i++) {
    const base = 26 + i * 34;
    const pts: string[] = [];
    for (let k = 0; k <= 96; k++) {
      const t = (k / 96) * Math.PI * 2;
      const rr = base * (1 + a[0] * Math.sin(2 * t + ph[0]) + a[1] * Math.sin(3 * t + ph[1]) + a[2] * Math.sin(5 * t + ph[2]));
      pts.push(`${(cx + rr * 1.45 * Math.cos(t)).toFixed(1)},${(cy + rr * Math.sin(t)).toFixed(1)}`);
    }
    out += `<polyline points="${pts.join(" ")}" fill="none" stroke="${i % 5 === 0 ? accent : ink}" stroke-width="${i % 5 === 0 ? 1.8 : 1}" opacity="${i % 5 === 0 ? 0.9 : 0.42}"/>`;
  }
  return out;
}

function grid(r: () => number, ink: string, accent: string): string {
  let out = "";
  for (let x = 0; x <= W; x += 40) out += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${ink}" stroke-width="${x % 200 === 0 ? 1.4 : 0.6}" opacity="${x % 200 === 0 ? 0.5 : 0.22}"/>`;
  for (let y = 0; y <= H; y += 40) out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${ink}" stroke-width="${y % 200 === 0 ? 1.4 : 0.6}" opacity="${y % 200 === 0 ? 0.5 : 0.22}"/>`;
  // kótovacia línia
  const x1 = 80 + r() * 120;
  const x2 = x1 + 240 + r() * 200;
  const y = 120 + r() * 260;
  out += `<g stroke="${accent}" stroke-width="2" fill="none"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 10}" x2="${x1}" y2="${y + 10}"/><line x1="${x2}" y1="${y - 10}" x2="${x2}" y2="${y + 10}"/></g>`;
  out += `<rect x="${x1 + 30}" y="${y - 90}" width="${(x2 - x1) * 0.6}" height="90" fill="none" stroke="${accent}" stroke-width="2"/>`;
  return out;
}

function waves(r: () => number, ink: string, accent: string): string {
  let out = "";
  for (let i = 0; i < 12; i++) {
    const y0 = 40 + i * 36;
    const amp = 12 + r() * 26;
    const f = 0.006 + r() * 0.01;
    const ph = r() * 6;
    const pts: string[] = [];
    for (let x = 0; x <= W; x += 10) pts.push(`${x},${(y0 + amp * Math.sin(x * f * 6 + ph)).toFixed(1)}`);
    out += `<polyline points="${pts.join(" ")}" fill="none" stroke="${i === 5 ? accent : ink}" stroke-width="${i === 5 ? 2.4 : 1.1}" opacity="${i === 5 ? 1 : 0.4}"/>`;
  }
  return out;
}

function blocks(r: () => number, ink: string, accent: string, bg: string): string {
  let out = "";
  for (let i = 0; i < 9; i++) {
    const w = 80 + r() * 200;
    const h = 60 + r() * 220;
    const x = r() * (W - w);
    const y = r() * (H - h);
    const fill = i === 3 ? accent : "none";
    out += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${fill}" fill-opacity="${i === 3 ? 0.9 : 0}" stroke="${ink}" stroke-width="1.3" opacity="${i === 3 ? 1 : 0.55}"/>`;
    if (i % 3 === 0) out += `<line x1="${x.toFixed(0)}" y1="${(y + h / 2).toFixed(0)}" x2="${(x + w).toFixed(0)}" y2="${(y + h / 2).toFixed(0)}" stroke="${ink}" stroke-width="0.8" opacity="0.35"/>`;
  }
  out += `<circle cx="${(300 + r() * 200).toFixed(0)}" cy="${(120 + r() * 200).toFixed(0)}" r="${(60 + r() * 60).toFixed(0)}" fill="none" stroke="${accent}" stroke-width="2"/>`;
  return out + `<rect width="${W}" height="${H}" fill="none" stroke="${bg}" stroke-width="0"/>`;
}

function hatch(_r: () => number, ink: string, accent: string): string {
  let out = "";
  for (let i = -H; i < W; i += 14) out += `<line x1="${i}" y1="${H}" x2="${i + H}" y2="0" stroke="${ink}" stroke-width="1" opacity="0.28"/>`;
  out += `<rect x="90" y="90" width="300" height="320" fill="${accent}" opacity="0.85"/>`;
  return out;
}

function dots(r: () => number, ink: string, accent: string): string {
  let out = "";
  for (let y = 16; y < H; y += 26) {
    for (let x = 16; x < W; x += 26) {
      const d = Math.hypot(x - 560, y - 240) / 420;
      const rad = Math.max(0.6, 8 * (1 - d) + r() * 1.2);
      out += `<circle cx="${x}" cy="${y}" r="${rad.toFixed(1)}" fill="${d < 0.32 ? accent : ink}" opacity="${d < 0.32 ? 1 : 0.5}"/>`;
    }
  }
  return out;
}

/** SVG grafika vyplňujúca rodičovský prvok (preserveAspectRatio slice). */
export function art(kind: ArtKind, seed: number, p: Palette): string {
  const r = rng(seed * 7919 + 13);
  const ink = mixHex(p.ink, p.bg, 0.25);
  const accent = p.accent2 ?? p.accent;
  const body =
    kind === "topo" ? topo(r, ink, accent)
    : kind === "grid" ? grid(r, ink, accent)
    : kind === "waves" ? waves(r, ink, accent)
    : kind === "blocks" ? blocks(r, ink, accent, p.bg)
    : kind === "hatch" ? hatch(r, ink, accent)
    : dots(r, ink, accent);
  return `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><rect width="${W}" height="${H}" fill="${p.surface}"/>${body}</svg>`;
}
