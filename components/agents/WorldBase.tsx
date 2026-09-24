"use client";

// Základ sveta: plávajúci ostrov, tráva, cesty, námestie, tiene štvrtí, mraky a vtáky.

import { memo } from "react";
import { DEPARTMENTS } from "@/lib/agents/registry";
import { N, P, TH, TW, circleRx, circleRy, darken, footprint, iso, lighten, rng, type Pt } from "./iso";

export const ISLAND = {
  top: iso(0, 0),
  right: iso(N, 0),
  bottom: iso(N, N),
  left: iso(0, N),
};
const SLAB = 30; // hrúbka trávnatej časti a hliny

/** Definície gradientov a vzorov používané celou scénou. */
export const WorldDefs = memo(function WorldDefs() {
  return (
    <defs>
      <linearGradient id="ag-grass" x1="0" y1="0" x2="0" y2={N * TH}>
        <stop offset="0" stopColor="#8bdc83" />
        <stop offset="1" stopColor="#5fbb68" />
      </linearGradient>
      <pattern id="ag-checker" x={-TW / 2} y={0} width={TW} height={TH} patternUnits="userSpaceOnUse">
        <polygon points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2}`} fill="#1d5b2c" opacity={0.055} />
      </pattern>
      <pattern id="ag-stone" x={-TW / 2} y={iso(6.5, 6.5)[1]} width={TW} height={TH} patternUnits="userSpaceOnUse">
        <rect width={TW} height={TH} fill="#e0d7c6" />
        <polygon points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2}`} fill="#d3c9b6" />
        <polyline points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2} ${TW / 2},0`} fill="none" stroke="#bfb49f" strokeWidth={1.1} opacity={0.75} />
        <circle cx={TW / 2 - 6} cy={TH / 2 - 2} r={1.3} fill="#c7bda8" />
        <circle cx={TW / 2 + 9} cy={TH / 2 + 3} r={1} fill="#c7bda8" />
      </pattern>
      <radialGradient id="ag-water" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#9be8ff" />
        <stop offset="0.6" stopColor="#4bb8ea" />
        <stop offset="1" stopColor="#2b8fc9" />
      </radialGradient>
      <linearGradient id="ag-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d6f0ff" />
        <stop offset="1" stopColor="#7fb6e6" />
      </linearGradient>
      <linearGradient id="ag-roof-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.28} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="ag-face-shade" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="1" stopColor="#8a5a40" stopOpacity={0.5} />
      </radialGradient>
      <radialGradient id="ag-window-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffd27a" stopOpacity={0.55} />
        <stop offset="1" stopColor="#ffd27a" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-lamp-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffe19a" stopOpacity={0.85} />
        <stop offset="0.35" stopColor="#ffd27a" stopOpacity={0.32} />
        <stop offset="1" stopColor="#ffd27a" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-ground-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffd27a" stopOpacity={0.4} />
        <stop offset="1" stopColor="#ffd27a" stopOpacity={0} />
      </radialGradient>
      <linearGradient id="ag-rock-l" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8a5e3c" />
        <stop offset="0.16" stopColor="#7d5a44" />
        <stop offset="0.3" stopColor="#8b8296" />
        <stop offset="1" stopColor="#525a70" />
      </linearGradient>
      <linearGradient id="ag-rock-r" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6d4a30" />
        <stop offset="0.16" stopColor="#634634" />
        <stop offset="0.3" stopColor="#6e6880" />
        <stop offset="1" stopColor="#3b4258" />
      </linearGradient>
      <radialGradient id="ag-crystal-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#7df9ff" stopOpacity={0.7} />
        <stop offset="1" stopColor="#7df9ff" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
});

// ── ostrov ──────────────────────────────────────────────────────────────────

function buildUnderside() {
  const r = rng(11);
  const [Lx, Ly] = ISLAND.left;
  const [Rx, Ry] = ISLAND.right;
  const [Bx, By] = ISLAND.bottom;
  const tipY = By + 165;
  const rows = 12;
  // spodná hrana zľava k hrotu a späť: nepravidelná, hlbšia k stredu
  const bottomLeft: Pt[] = [];
  const bottomRight: Pt[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const x = Lx + (Bx - Lx) * t;
    const yEdge = Ly + (By - Ly) * t + SLAB;
    const depth = (tipY - (Ly + (By - Ly) * t + SLAB)) * Math.pow(t, 1.35);
    const jag = (r() - 0.5) * 26 + (i % 3 === 1 ? 26 : 0);
    bottomLeft.push([x, yEdge + depth + jag]);
    const xr = Rx + (Bx - Rx) * t;
    const yEdgeR = Ry + (By - Ry) * t + SLAB;
    const depthR = (tipY - (Ry + (By - Ry) * t + SLAB)) * Math.pow(t, 1.35);
    const jagR = (r() - 0.5) * 26 + (i % 3 === 2 ? 26 : 0);
    bottomRight.push([xr, yEdgeR + depthR + jagR]);
  }
  bottomLeft[rows] = [Bx, tipY];
  bottomRight[rows] = [Bx, tipY];
  return { bottomLeft, bottomRight };
}
const UNDER = buildUnderside();

export const Island = memo(function Island() {
  const [Lx, Ly] = ISLAND.left;
  const [Rx, Ry] = ISLAND.right;
  const [Bx, By] = ISLAND.bottom;
  const leftPoly: Pt[] = [[Lx, Ly], [Bx, By], ...([...UNDER.bottomLeft].reverse() as Pt[])];
  const rightPoly: Pt[] = [[Bx, By], [Rx, Ry], ...(UNDER.bottomRight as Pt[])];
  const r = rng(29);
  // fazety skál
  const facets = (poly: "L" | "R") =>
    Array.from({ length: 18 }).map((_, i) => {
      const t = 0.08 + r() * 0.84;
      const bot = poly === "L" ? UNDER.bottomLeft : UNDER.bottomRight;
      const idx = Math.min(bot.length - 2, Math.floor((poly === "L" ? 1 - t : 1 - t) * (bot.length - 1)));
      const a = bot[idx];
      const [sx, sy] = poly === "L" ? [Lx, Ly] : [Rx, Ry];
      const px = sx + (Bx - sx) * t;
      const py = sy + (By - sy) * t + SLAB;
      const size = 16 + r() * 34;
      const tone = r() > 0.5;
      return (
        <polygon
          key={poly + i}
          points={P([[px - size * 0.6, py + size * 0.3], [px + size * 0.2, py + size * 1.5 + a[1] * 0.02], [px + size * 0.7, py + size * 0.2]])}
          fill={tone ? "#ffffff" : "#000000"}
          opacity={tone ? 0.05 : 0.09}
        />
      );
    });

  // kryštály pod ostrovom
  const crystals: [number, number, number, number][] = [
    [-120, By + 96, 20, 44],
    [-92, By + 112, 13, 30],
    [104, By + 90, 18, 40],
    [76, By + 116, 11, 26],
  ];

  return (
    <g>
      {/* skala a hlina */}
      <polygon points={P(leftPoly)} fill="url(#ag-rock-l)" />
      <polygon points={P(rightPoly)} fill="url(#ag-rock-r)" />
      {facets("L")}
      {facets("R")}
      {/* pás hliny */}
      <polygon points={P([[Lx, Ly], [Bx, By], [Bx, By + 20], [Lx, Ly + 20]])} fill="#8a5e3c" opacity={0.0} />
      {/* kamienky v hline */}
      {Array.from({ length: 26 }).map((_, i) => {
        const t = r();
        const side = i % 2 ? 1 : -1;
        const sx = side < 0 ? Lx : Rx;
        const sy = side < 0 ? Ly : Ry;
        const x = sx + (Bx - sx) * t;
        const y = sy + (By - sy) * t + 12 + r() * 14;
        return <ellipse key={i} cx={x} cy={y} rx={2 + r() * 3} ry={1.4 + r() * 1.6} fill={side < 0 ? "#a7846a" : "#7a5a44"} opacity={0.7} />;
      })}
      {/* trávnatý okraj */}
      <polygon points={P([[Lx, Ly], [Bx, By], [Bx, By + 13], [Lx, Ly + 13]])} fill="#4fae5c" />
      <polygon points={P([[Bx, By], [Rx, Ry], [Rx, Ry + 13], [Bx, By + 13]])} fill="#3d9a4d" />
      {/* korienky */}
      {Array.from({ length: 16 }).map((_, i) => {
        const t = 0.05 + r() * 0.9;
        const side = i % 2 ? 1 : -1;
        const sx = side < 0 ? Lx : Rx;
        const sy = side < 0 ? Ly : Ry;
        const x = sx + (Bx - sx) * t;
        const y = sy + (By - sy) * t + 12;
        const len = 12 + r() * 30;
        return <path key={i} d={`M${x},${y} q${(r() - 0.5) * 8},${len * 0.5} ${(r() - 0.5) * 6},${len}`} stroke="#3d7a3f" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.9} />;
      })}
      {/* kryštály */}
      {crystals.map(([x, y, w, h], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r={w * 2.4} fill="url(#ag-crystal-glow)" className="ag-twinkle" style={{ animationDelay: `${i * 0.7}s` }} />
          <polygon points={`0,${-h} ${w},${-h * 0.25} ${w * 0.6},0 ${-w * 0.6},0 ${-w},${-h * 0.25}`} fill="#66e6ff" />
          <polygon points={`0,${-h} ${w},${-h * 0.25} ${w * 0.6},0 0,0`} fill="#3cc4e6" />
          <polygon points={`0,${-h} ${-w},${-h * 0.25} ${-w * 0.2},${-h * 0.2}`} fill="#c8f7ff" opacity={0.85} />
        </g>
      ))}
    </g>
  );
});

// ── povrch ──────────────────────────────────────────────────────────────────

const tuft = (x: number, y: number, s: number, c: string) => (
  <path key={`${x}-${y}`} d={`M${x - 3 * s},${y} q${1 * s},${-6 * s} ${2 * s},${-8 * s} q${1 * s},${5 * s} ${2 * s},${8 * s} M${x + 1 * s},${y} q${1 * s},${-5 * s} ${3 * s},${-7 * s}`} stroke={c} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55} />
);

/** Obdĺžnik cesty (v mriežke) so vzorom dlažby. */
const PathRect = ({ r }: { r: [number, number, number, number] }) => (
  <g>
    <polygon points={footprint(r[0] - 0.06, r[1] - 0.06, r[2] - r[0] + 0.12, r[3] - r[1] + 0.12)} fill="#c9bea8" />
    <polygon points={footprint(r[0], r[1], r[2] - r[0], r[3] - r[1])} fill="url(#ag-stone)" />
  </g>
);

export const PATHS: [number, number, number, number][] = [
  [6.5, 0, 7.5, 14], // zvislá cesta
  [0, 6.5, 14, 7.5], // vodorovná cesta
  [7.5, 12.5, 11.5, 13.5], // k Nore
  [10.5, 11.4, 11.5, 12.5], // schodík k dverám
  [10.5, 3.4, 11.5, 6.5], // chodník od dverí Mirovho domu k vodorovnej ceste
  [3.8, 10.5, 6.5, 11.5], // technika A
  [5.0, 2.5, 6.5, 3.5], // financie A
];

export const Ground = memo(function Ground() {
  const r = rng(5);
  const tufts: React.ReactNode[] = [];
  for (let i = 0; i < 90; i++) {
    const gx = 0.3 + r() * (N - 0.6);
    const gy = 0.3 + r() * (N - 0.6);
    const onPath = PATHS.some((p) => gx > p[0] - 0.2 && gx < p[2] + 0.2 && gy > p[1] - 0.2 && gy < p[3] + 0.2);
    if (onPath) continue;
    const [x, y] = iso(gx, gy);
    tufts.push(tuft(x, y, 0.8 + r() * 0.6, "#2f7a3a"));
  }
  const [cx, cy] = iso(7, 7);
  return (
    <g>
      <polygon points={P([ISLAND.top, ISLAND.right, ISLAND.bottom, ISLAND.left])} fill="url(#ag-grass)" />
      <polygon points={P([ISLAND.top, ISLAND.right, ISLAND.bottom, ISLAND.left])} fill="url(#ag-checker)" />
      {/* farebné štvrte */}
      {DEPARTMENTS.map((d) => (
        <g key={d.id}>
          <polygon points={footprint(d.rect[0] + 0.2, d.rect[1] + 0.2, d.rect[2] - d.rect[0] - 0.4, d.rect[3] - d.rect[1] - 0.4)} fill={d.color} opacity={0.085} />
          <polygon points={footprint(d.rect[0] + 0.2, d.rect[1] + 0.2, d.rect[2] - d.rect[0] - 0.4, d.rect[3] - d.rect[1] - 0.4)} fill="none" stroke={d.color} strokeWidth={1.6} strokeDasharray="2 9" strokeLinecap="round" opacity={0.5} />
        </g>
      ))}
      {tufts}
      {/* cesty */}
      {PATHS.map((p, i) => (
        <PathRect key={i} r={p} />
      ))}
      {/* námestie */}
      <ellipse cx={cx} cy={cy + 6} rx={circleRx(1.95)} ry={circleRy(1.95)} fill="#b9ae98" />
      <ellipse cx={cx} cy={cy} rx={circleRx(1.95)} ry={circleRy(1.95)} fill="#d9cfbb" />
      <ellipse cx={cx} cy={cy} rx={circleRx(1.7)} ry={circleRy(1.7)} fill="#e6dccb" />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * circleRx(1.05)} y1={cy + Math.sin(a) * circleRy(1.05)} x2={cx + Math.cos(a) * circleRx(1.7)} y2={cy + Math.sin(a) * circleRy(1.7)} stroke="#cfc4ae" strokeWidth={1.2} />;
      })}
      {[1.2, 1.45].map((rr) => (
        <ellipse key={rr} cx={cx} cy={cy} rx={circleRx(rr)} ry={circleRy(rr)} fill="none" stroke="#cfc4ae" strokeWidth={1.2} />
      ))}
    </g>
  );
});

// ── mraky a vtáky (pozadie) ─────────────────────────────────────────────────

const Cloud = ({ x, y, s, o, speed, delay }: { x: number; y: number; s: number; o: number; speed: number; delay: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <g className="ag-cloud" style={{ animationDuration: `${speed}s`, animationDelay: `${delay}s` }}>
      <ellipse cx={0} cy={0} rx={62} ry={17} fill="#fff" />
      <circle cx={-20} cy={-11} r={19} fill="#fff" />
      <circle cx={10} cy={-19} r={24} fill="#fff" />
      <circle cx={34} cy={-8} r={16} fill="#fff" />
      <ellipse cx={0} cy={9} rx={58} ry={9} fill="#dbe7f5" opacity={0.7} />
    </g>
  </g>
);

export const Clouds = memo(function Clouds() {
  return (
    <g>
      <Cloud x={-900} y={-130} s={1.5} o={0.9} speed={140} delay={-30} />
      <Cloud x={-360} y={-260} s={1.1} o={0.85} speed={170} delay={-90} />
      <Cloud x={620} y={-170} s={1.7} o={0.85} speed={190} delay={-60} />
      <Cloud x={-780} y={520} s={1.3} o={0.9} speed={160} delay={-20} />
      <Cloud x={780} y={640} s={1.9} o={0.9} speed={210} delay={-120} />
      <Cloud x={-140} y={880} s={1.6} o={0.9} speed={180} delay={-70} />
      <Cloud x={300} y={-320} s={0.9} o={0.7} speed={150} delay={-10} />
    </g>
  );
});

export const Birds = memo(function Birds() {
  return (
    <g fill="none" stroke="#33415c" strokeWidth={2} strokeLinecap="round" opacity={0.75}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${-60 - i * 34})`}>
          <g className="ag-bird" style={{ animationDelay: `${i * -6}s`, animationDuration: `${46 + i * 7}s` }}>
            <path d="M-8,0 q4,-6 8,0 q4,-6 8,0" className="ag-flap" style={{ animationDelay: `${i * 0.2}s` }} />
          </g>
        </g>
      ))}
    </g>
  );
});

/** Zlaď farbu s okolím (trochu tmavšia tráva pri okrajoch ostrova ap.). */
export const grassShade = (t: number) => darken(lighten("#7fd27a", 0.1), t);
