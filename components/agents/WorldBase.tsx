"use client";

// Základ sveta: plávajúca paluba operačného centra (kovový trup, svetelné pásy, trysky), dráhy,
// holografické zóny štvrtí, centrálna platforma, hmlovina a hliadkujúce drony v pozadí.

import { memo } from "react";
import { DEPARTMENTS } from "@/lib/agents/registry";
import { N, P, TH, TW, circleRx, circleRy, footprint, iso, rng, type Pt } from "./iso";

export const ISLAND = {
  top: iso(0, 0),
  right: iso(N, 0),
  bottom: iso(N, N),
  left: iso(0, N),
};
const SLAB = 30; // hrúbka palubnej dosky

/** Definície gradientov a vzorov používané celou scénou. */
export const WorldDefs = memo(function WorldDefs() {
  return (
    <defs>
      <linearGradient id="ag-deck" x1="0" y1="0" x2="0" y2={N * TH}>
        <stop offset="0" stopColor="#1d2a4d" />
        <stop offset="1" stopColor="#0f1830" />
      </linearGradient>
      <pattern id="ag-plates" x={-TW / 2} y={0} width={TW} height={TH} patternUnits="userSpaceOnUse">
        <polygon points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2}`} fill="none" stroke="#5b73a8" strokeWidth={0.9} opacity={0.32} />
        <polygon points={`${TW / 2},4 ${TW - 8},${TH / 2} ${TW / 2},${TH - 4} 8,${TH / 2}`} fill="#ffffff" opacity={0.018} />
        <circle cx={TW / 2} cy={2.4} r={1.1} fill="#8fa4d6" opacity={0.35} />
        <circle cx={TW - 2.4} cy={TH / 2} r={1.1} fill="#8fa4d6" opacity={0.25} />
      </pattern>
      <pattern id="ag-lane" x={-TW / 2} y={iso(6.5, 6.5)[1]} width={TW} height={TH} patternUnits="userSpaceOnUse">
        <rect width={TW} height={TH} fill="#080d1b" />
        <polygon points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2}`} fill="#0b1224" />
        <polyline points={`${TW / 2},0 ${TW},${TH / 2} ${TW / 2},${TH} 0,${TH / 2} ${TW / 2},0`} fill="none" stroke="#2a3a63" strokeWidth={0.8} opacity={0.6} />
      </pattern>
      <radialGradient id="ag-water" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#c8faff" />
        <stop offset="0.55" stopColor="#38d5f5" />
        <stop offset="1" stopColor="#0a6fa8" />
      </radialGradient>
      <linearGradient id="ag-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1c3a63" />
        <stop offset="0.55" stopColor="#0d223f" />
        <stop offset="1" stopColor="#0a1a30" />
      </linearGradient>
      <linearGradient id="ag-roof-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.16} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="ag-face-shade" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="1" stopColor="#3a2a24" stopOpacity={0.35} />
      </radialGradient>
      <radialGradient id="ag-window-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#7ee7ff" stopOpacity={0.5} />
        <stop offset="1" stopColor="#7ee7ff" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-lamp-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#c8f6ff" stopOpacity={0.75} />
        <stop offset="0.35" stopColor="#5fe0ff" stopOpacity={0.28} />
        <stop offset="1" stopColor="#5fe0ff" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-ground-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#5fe0ff" stopOpacity={0.34} />
        <stop offset="1" stopColor="#5fe0ff" stopOpacity={0} />
      </radialGradient>
      <linearGradient id="ag-hull-l" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#34446f" />
        <stop offset="0.25" stopColor="#222f52" />
        <stop offset="1" stopColor="#0a0f20" />
      </linearGradient>
      <linearGradient id="ag-hull-r" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#222f52" />
        <stop offset="0.25" stopColor="#172140" />
        <stop offset="1" stopColor="#060a16" />
      </linearGradient>
      <radialGradient id="ag-crystal-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#7df9ff" stopOpacity={0.7} />
        <stop offset="1" stopColor="#7df9ff" stopOpacity={0} />
      </radialGradient>
      <linearGradient id="ag-thrust" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6fbff" stopOpacity={0.95} />
        <stop offset="0.35" stopColor="#4fd8ff" stopOpacity={0.6} />
        <stop offset="1" stopColor="#1f7bff" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="ag-beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#6be8ff" stopOpacity={0.55} />
        <stop offset="1" stopColor="#6be8ff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="ag-nebula-a" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#3ea6ff" stopOpacity={0.2} />
        <stop offset="1" stopColor="#3ea6ff" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-nebula-b" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#8b5cf6" stopOpacity={0.2} />
        <stop offset="1" stopColor="#8b5cf6" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ag-nebula-c" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#22d3ee" stopOpacity={0.16} />
        <stop offset="1" stopColor="#22d3ee" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
});

// ── paluba ──────────────────────────────────────────────────────────────────

function buildUnderside() {
  const r = rng(11);
  const [Lx, Ly] = ISLAND.left;
  const [Rx, Ry] = ISLAND.right;
  const [Bx, By] = ISLAND.bottom;
  const tipY = By + 150;
  const rows = 12;
  const bottomLeft: Pt[] = [];
  const bottomRight: Pt[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const x = Lx + (Bx - Lx) * t;
    const yEdge = Ly + (By - Ly) * t + SLAB;
    const depth = (tipY - (Ly + (By - Ly) * t + SLAB)) * Math.pow(t, 1.35);
    // trup je zrezaný do pravidelných stupňov (nie skala)
    const step = (i % 2 === 1 ? 12 : 0) + (r() - 0.5) * 4;
    bottomLeft.push([x, yEdge + depth + step]);
    const xr = Rx + (Bx - Rx) * t;
    const yEdgeR = Ry + (By - Ry) * t + SLAB;
    const depthR = (tipY - (Ry + (By - Ry) * t + SLAB)) * Math.pow(t, 1.35);
    const stepR = (i % 2 === 0 ? 12 : 0) + (r() - 0.5) * 4;
    bottomRight.push([xr, yEdgeR + depthR + stepR]);
  }
  bottomLeft[rows] = [Bx, tipY];
  bottomRight[rows] = [Bx, tipY];
  return { bottomLeft, bottomRight, tipY, rows };
}
const UNDER = buildUnderside();

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const Island = memo(function Island() {
  const [Lx, Ly] = ISLAND.left;
  const [Rx, Ry] = ISLAND.right;
  const [Bx, By] = ISLAND.bottom;
  const leftPoly: Pt[] = [[Lx, Ly], [Bx, By], ...([...UNDER.bottomLeft].reverse() as Pt[])];
  const rightPoly: Pt[] = [[Bx, By], [Rx, Ry], ...(UNDER.bottomRight as Pt[])];
  const topL = (t: number): Pt => [Lx + (Bx - Lx) * t, Ly + (By - Ly) * t + SLAB];
  const topR = (t: number): Pt => [Rx + (Bx - Rx) * t, Ry + (By - Ry) * t + SLAB];

  // rebrá a pásy plechov trupu
  const ribs = (side: "L" | "R") => {
    const bot = side === "L" ? UNDER.bottomLeft : UNDER.bottomRight;
    const tp = side === "L" ? topL : topR;
    const out: React.ReactNode[] = [];
    for (let i = 1; i < UNDER.rows; i++) {
      const t = i / UNDER.rows;
      const a = tp(t);
      const b = bot[i];
      out.push(<line key={`${side}v${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#7d93c9" strokeWidth={0.9} opacity={0.16} />);
    }
    for (const k of [0.34, 0.62]) {
      const pts: Pt[] = [];
      for (let i = 0; i <= UNDER.rows; i++) pts.push(lerp(tp(i / UNDER.rows), bot[i], k));
      out.push(<polyline key={`${side}h${k}`} points={P(pts)} fill="none" stroke="#7d93c9" strokeWidth={0.9} opacity={0.18} />);
    }
    return out;
  };

  // svetlá pozdĺž bočnej dosky
  const deckLights = (side: "L" | "R") => {
    const tp = side === "L" ? topL : topR;
    return Array.from({ length: 12 }).map((_, i) => {
      const t = 0.06 + i * 0.077;
      const [x, y] = tp(t);
      return <rect key={`${side}${i}`} x={x - 3} y={y - SLAB + 15} width={6} height={2.6} rx={1.3} fill={i % 4 === 1 ? "#fbbf24" : "#67e8f9"} opacity={0.85} className="ag-twinkle" style={{ animationDelay: `${(i % 5) * 0.55}s` }} />;
    });
  };

  const [tx, ty] = [Bx, UNDER.tipY];
  const crystals: [number, number, number, number][] = [
    [-118, By + 88, 17, 38],
    [-90, By + 106, 11, 26],
    [104, By + 84, 15, 34],
    [76, By + 108, 10, 22],
  ];

  return (
    <g>
      {/* trysky pod trupom */}
      {[-44, 0, 44].map((dx, i) => (
        <g key={i} transform={`translate(${tx + dx} ${ty - Math.abs(dx) * 0.5 - 6})`}>
          <ellipse cx={0} cy={2} rx={15} ry={5.5} fill="#0a1020" />
          <rect x={-10} y={-10} width={20} height={12} rx={2} fill="#1a2544" />
          <ellipse cx={0} cy={2} rx={9} ry={3.4} fill="#7fe8ff" />
          <polygon points="-8,4 8,4 3,64 -3,64" fill="url(#ag-thrust)" className="ag-thrust" style={{ animationDelay: `${i * 0.23}s` }} />
          <ellipse cx={0} cy={8} rx={24} ry={9} fill="url(#ag-crystal-glow)" className="ag-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
        </g>
      ))}

      {/* trup */}
      <polygon points={P(leftPoly)} fill="url(#ag-hull-l)" />
      <polygon points={P(rightPoly)} fill="url(#ag-hull-r)" />
      {ribs("L")}
      {ribs("R")}
      {/* obrysy trupu */}
      <polyline points={P([...UNDER.bottomLeft])} fill="none" stroke="#5f78b4" strokeWidth={1.4} opacity={0.5} />
      <polyline points={P([...UNDER.bottomRight])} fill="none" stroke="#3f5490" strokeWidth={1.4} opacity={0.5} />

      {/* energetické jadrá po bokoch */}
      {crystals.map(([x, y, w, h], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r={w * 2.4} fill="url(#ag-crystal-glow)" className="ag-twinkle" style={{ animationDelay: `${i * 0.7}s` }} />
          <polygon points={`0,${-h} ${w},${-h * 0.25} ${w * 0.6},0 ${-w * 0.6},0 ${-w},${-h * 0.25}`} fill="#66e6ff" />
          <polygon points={`0,${-h} ${w},${-h * 0.25} ${w * 0.6},0 0,0`} fill="#3cc4e6" />
          <polygon points={`0,${-h} ${-w},${-h * 0.25} ${-w * 0.2},${-h * 0.2}`} fill="#c8f7ff" opacity={0.85} />
        </g>
      ))}

      {/* bočná doska palubného poschodia */}
      <polygon points={P([[Lx, Ly], [Bx, By], [Bx, By + SLAB], [Lx, Ly + SLAB]])} fill="#1b2748" />
      <polygon points={P([[Bx, By], [Rx, Ry], [Rx, Ry + SLAB], [Bx, By + SLAB]])} fill="#111a34" />
      <polygon points={P([[Lx, Ly + 9], [Bx, By + 9], [Bx, By + 12], [Lx, Ly + 12]])} fill="#0a1226" opacity={0.7} />
      <polygon points={P([[Bx, By + 9], [Rx, Ry + 9], [Rx, Ry + 12], [Bx, By + 12]])} fill="#070d1e" opacity={0.7} />
      {deckLights("L")}
      {deckLights("R")}
      {/* svetelný lem paluby */}
      <polyline points={P([ISLAND.left, ISLAND.bottom, ISLAND.right])} fill="none" stroke="#22d3ee" strokeWidth={7} opacity={0.14} strokeLinejoin="round" />
      <polyline points={P([ISLAND.left, ISLAND.bottom, ISLAND.right])} fill="none" stroke="#7ce9ff" strokeWidth={2} opacity={0.95} strokeLinejoin="round" />
      <polyline points={P([ISLAND.left, ISLAND.top, ISLAND.right])} fill="none" stroke="#4b6199" strokeWidth={1.4} opacity={0.6} strokeLinejoin="round" />
    </g>
  );
});

// ── povrch ──────────────────────────────────────────────────────────────────

/** Dráha (v mriežke): tmavý povrch, svetelné okraje; hlavné tepny majú prúd energie po osi. */
const Lane = ({ r, flow }: { r: [number, number, number, number]; flow: boolean }) => {
  const w = r[2] - r[0];
  const d = r[3] - r[1];
  const alongX = w > d;
  const c1: Pt = alongX ? iso(r[0], (r[1] + r[3]) / 2) : iso((r[0] + r[2]) / 2, r[1]);
  const c2: Pt = alongX ? iso(r[2], (r[1] + r[3]) / 2) : iso((r[0] + r[2]) / 2, r[3]);
  return (
    <g>
      <polygon points={footprint(r[0], r[1], w, d)} fill="url(#ag-lane)" />
      <polygon points={footprint(r[0], r[1], w, d)} fill="none" stroke="#2fd0f0" strokeWidth={1.3} opacity={0.4} />
      {flow && <line x1={c1[0]} y1={c1[1]} x2={c2[0]} y2={c2[1]} stroke="#67e8f9" strokeWidth={2} strokeDasharray="10 18" strokeLinecap="round" opacity={0.75} className="ag-dash" />}
    </g>
  );
};

export const PATHS: [number, number, number, number][] = [
  [6.5, 0, 7.5, 14], // zvislá tepna
  [0, 6.5, 14, 7.5], // vodorovná tepna
  [7.5, 12.5, 11.5, 13.5], // k Nore
  [10.5, 11.4, 11.5, 12.5], // schodík k dverám
  [10.5, 3.4, 11.5, 6.5], // chodník od dverí Mirovho modulu k vodorovnej ceste
  [3.8, 10.5, 6.5, 11.5], // technika A
  [5.0, 2.5, 6.5, 3.5], // financie A
];

/** rohové značky holografickej zóny */
const Ticks = ({ x0, y0, x1, y1, color }: { x0: number; y0: number; x1: number; y1: number; color: string }) => {
  const L = 0.7;
  const seg = (a: Pt, b: Pt, c: Pt) => <polyline points={P([a, b, c])} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />;
  return (
    <g>
      {seg(iso(x0 + L, y0), iso(x0, y0), iso(x0, y0 + L))}
      {seg(iso(x1 - L, y0), iso(x1, y0), iso(x1, y0 + L))}
      {seg(iso(x1 - L, y1), iso(x1, y1), iso(x1, y1 - L))}
      {seg(iso(x0 + L, y1), iso(x0, y1), iso(x0, y1 - L))}
    </g>
  );
};

export const Ground = memo(function Ground() {
  const [cx, cy] = iso(7, 7);
  return (
    <g>
      <polygon points={P([ISLAND.top, ISLAND.right, ISLAND.bottom, ISLAND.left])} fill="url(#ag-deck)" />
      <polygon points={P([ISLAND.top, ISLAND.right, ISLAND.bottom, ISLAND.left])} fill="url(#ag-plates)" />
      {/* holografické zóny štvrtí */}
      {DEPARTMENTS.map((d) => {
        const [x0, y0, x1, y1] = [d.rect[0] + 0.25, d.rect[1] + 0.25, d.rect[2] - 0.25, d.rect[3] - 0.25];
        return (
          <g key={d.id}>
            <polygon points={footprint(x0, y0, x1 - x0, y1 - y0)} fill={d.color} opacity={0.075} />
            <polygon points={footprint(x0, y0, x1 - x0, y1 - y0)} fill="none" stroke={d.color} strokeWidth={1} opacity={0.35} />
            <Ticks x0={x0} y0={y0} x1={x1} y1={y1} color={d.color} />
          </g>
        );
      })}
      {/* dráhy */}
      {PATHS.map((p, i) => (
        <Lane key={i} r={p} flow={i < 2} />
      ))}
      {/* centrálna platforma */}
      <ellipse cx={cx} cy={cy + 8} rx={circleRx(2.0)} ry={circleRy(2.0)} fill="#070c1a" />
      <ellipse cx={cx} cy={cy} rx={circleRx(2.0)} ry={circleRy(2.0)} fill="#0f1a35" stroke="#2fd0f0" strokeWidth={2} strokeOpacity={0.7} />
      <ellipse cx={cx} cy={cy} rx={circleRx(1.72)} ry={circleRy(1.72)} fill="#0a1226" stroke="#3b4f86" strokeWidth={1.2} />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * circleRx(1.15)} y1={cy + Math.sin(a) * circleRy(1.15)} x2={cx + Math.cos(a) * circleRx(1.72)} y2={cy + Math.sin(a) * circleRy(1.72)} stroke="#2e4278" strokeWidth={1} opacity={0.75} />;
      })}
      <ellipse cx={cx} cy={cy} rx={circleRx(1.45)} ry={circleRy(1.45)} fill="none" stroke="#67e8f9" strokeWidth={1.6} strokeDasharray="7 11" opacity={0.6} className="ag-dash" />
      <ellipse cx={cx} cy={cy} rx={circleRx(1.15)} ry={circleRy(1.15)} fill="url(#ag-ground-glow)" />
    </g>
  );
});

// ── hmlovina, vzdialené lode a drony (pozadie) ──────────────────────────────

const Wisp = ({ x, y, rx, ry, fill, speed, delay }: { x: number; y: number; rx: number; ry: number; fill: string; speed: number; delay: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <g className="ag-cloud" style={{ animationDuration: `${speed}s`, animationDelay: `${delay}s` }}>
      <ellipse cx={0} cy={0} rx={rx} ry={ry} fill={fill} />
    </g>
  </g>
);

/** Vzdialená loď: tmavá silueta s pár svetlami. */
const Carrier = ({ x, y, s, o }: { x: number; y: number; s: number; o: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <polygon points="-90,0 -20,-22 70,-22 110,0 70,10 -60,10" fill="#0c1430" />
    <polygon points="-60,10 70,10 40,24 -30,24" fill="#080e22" />
    <polygon points="-20,-22 70,-22 62,-30 -8,-30" fill="#131d40" />
    {[-70, -40, -10, 20, 50, 80].map((lx, i) => (
      <rect key={i} x={lx} y={-6} width={7} height={2.4} rx={1.2} fill={i % 3 === 0 ? "#fbbf24" : "#67e8f9"} opacity={0.85} className="ag-twinkle" style={{ animationDelay: `${i * 0.6}s` }} />
    ))}
    <polygon points="-6,24 6,24 3,44 -3,44" fill="url(#ag-thrust)" opacity={0.7} className="ag-thrust" />
  </g>
);

export const Clouds = memo(function Clouds() {
  return (
    <g>
      <Wisp x={-900} y={-130} rx={340} ry={70} fill="url(#ag-nebula-a)" speed={170} delay={-40} />
      <Wisp x={-300} y={-300} rx={300} ry={62} fill="url(#ag-nebula-b)" speed={210} delay={-100} />
      <Wisp x={640} y={-190} rx={380} ry={80} fill="url(#ag-nebula-c)" speed={230} delay={-70} />
      <Wisp x={-800} y={540} rx={360} ry={80} fill="url(#ag-nebula-b)" speed={200} delay={-30} />
      <Wisp x={780} y={650} rx={420} ry={90} fill="url(#ag-nebula-a)" speed={240} delay={-130} />
      <Wisp x={-140} y={900} rx={380} ry={80} fill="url(#ag-nebula-c)" speed={190} delay={-80} />
      <Carrier x={-980} y={300} s={1.5} o={0.55} />
      <Carrier x={1010} y={-40} s={1.1} o={0.5} />
      <Carrier x={880} y={860} s={2} o={0.5} />
    </g>
  );
});

export const Birds = memo(function Birds() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${-60 - i * 34})`}>
          <g className="ag-bird" style={{ animationDelay: `${i * -6}s`, animationDuration: `${46 + i * 7}s` }}>
            <g>
              <path d="M-7,0 L0,-2 L7,0 L0,2 Z" fill="#1a2544" stroke="#5f78b4" strokeWidth={0.8} />
              <circle cx={0} cy={0} r={1.6} fill={i % 2 ? "#fbbf24" : "#67e8f9"} className="ag-pulse-dot" style={{ animationDelay: `${i * 0.3}s` }} />
              <line x1={-7} y1={0} x2={-11} y2={-2} stroke="#5f78b4" strokeWidth={1} />
              <line x1={7} y1={0} x2={11} y2={-2} stroke="#5f78b4" strokeWidth={1} />
            </g>
          </g>
        </g>
      ))}
    </g>
  );
});
