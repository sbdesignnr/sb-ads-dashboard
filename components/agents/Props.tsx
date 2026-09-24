"use client";

// Drobné objekty sveta: stromy, lampy, lavička, smerovníky, fontána, pracovný stôl, schránka…
// Všetko je čistý SVG kreslený v súradniciach scény (pozri iso.ts), počiatok objektu je pri zemi.

import { memo } from "react";
import { P, iso, circleRx, circleRy, darken, lighten, mix } from "./iso";

// ── základné teleso ─────────────────────────────────────────────────────────

interface BoxProps {
  gx: number;
  gy: number;
  w: number;
  d: number;
  h: number;
  z?: number;
  color: string;
  /** vrchná plocha (predvolene svetlejšia) */
  top?: string;
  stroke?: string;
}

/** Kváder v izometrii: vrch + dve viditeľné steny (pri +y a +x). */
export function IsoBox({ gx, gy, w, d, h, z = 0, color, top, stroke }: BoxProps) {
  const A = P([iso(gx, gy + d, z), iso(gx + w, gy + d, z), iso(gx + w, gy + d, z + h), iso(gx, gy + d, z + h)]);
  const B = P([iso(gx + w, gy + d, z), iso(gx + w, gy, z), iso(gx + w, gy, z + h), iso(gx + w, gy + d, z + h)]);
  const T = P([iso(gx, gy, z + h), iso(gx + w, gy, z + h), iso(gx + w, gy + d, z + h), iso(gx, gy + d, z + h)]);
  return (
    <g strokeLinejoin="round" stroke={stroke} strokeWidth={stroke ? 0.8 : 0}>
      <polygon points={A} fill={color} />
      <polygon points={B} fill={darken(color, 0.22)} />
      <polygon points={T} fill={top ?? lighten(color, 0.16)} />
    </g>
  );
}

/** mäkký tieň pod objektom */
export function Shadow({ x = 0, y = 0, rx, ry, o = 0.2 }: { x?: number; y?: number; rx: number; ry: number; o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#0b1220" opacity={o} />;
}

// ── stromy a rastliny ───────────────────────────────────────────────────────

export type TreeKind = "round" | "pine" | "blossom" | "autumn" | "teal";

const FOLIAGE: Record<TreeKind, [string, string, string]> = {
  round: ["#2f8f4e", "#3fae5f", "#7bd88f"],
  pine: ["#1f6f55", "#2a8c6a", "#5cc19a"],
  blossom: ["#e05f9a", "#f383b6", "#ffc1dc"],
  autumn: ["#d9762b", "#f09a3e", "#ffd07a"],
  teal: ["#1b8c9c", "#25aebf", "#7fe3ee"],
};

export const Tree = memo(function Tree({
  gx,
  gy,
  kind = "round",
  s = 1,
  seed = 0,
}: {
  gx: number;
  gy: number;
  kind?: TreeKind;
  s?: number;
  seed?: number;
}) {
  const [x, y] = iso(gx, gy);
  const [dark, mid, light] = FOLIAGE[kind];
  const delay = -((seed * 1.7) % 5);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shadow x={12} y={3} rx={34} ry={12} o={0.2} />
      <rect x={-5} y={-38} width={10} height={40} rx={3} fill="#8a5a3b" />
      <rect x={1} y={-38} width={4} height={40} rx={2} fill="#6d4429" />
      <g className="ag-sway" style={{ animationDelay: `${delay}s` }}>
        {kind === "pine" ? (
          <>
            <polygon points="0,-118 -30,-64 30,-64" fill={mid} />
            <polygon points="0,-96 -38,-40 38,-40" fill={dark} />
            <polygon points="0,-72 -44,-14 44,-14" fill={mid} />
            <polygon points="0,-118 -30,-64 -2,-64" fill={light} opacity={0.45} />
            <polygon points="0,-72 -44,-14 -10,-14" fill={light} opacity={0.28} />
          </>
        ) : (
          <>
            <circle cx={0} cy={-58} r={31} fill={dark} />
            <circle cx={-18} cy={-50} r={23} fill={mid} />
            <circle cx={19} cy={-52} r={25} fill={mid} />
            <circle cx={2} cy={-78} r={26} fill={mid} />
            <circle cx={-10} cy={-84} r={16} fill={light} opacity={0.85} />
            <circle cx={-22} cy={-58} r={10} fill={light} opacity={0.7} />
            <circle cx={12} cy={-90} r={8} fill={light} opacity={0.6} />
            {kind === "blossom" &&
              [[-20, -70], [14, -64], [-2, -92], [22, -48], [-8, -46], [6, -74]].map(([a, b], i) => (
                <circle key={i} cx={a} cy={b} r={3.2} fill="#fff3f8" opacity={0.9} />
              ))}
          </>
        )}
      </g>
    </g>
  );
});

export const Bush = memo(function Bush({ gx, gy, s = 1, color = "#3ba55d" }: { gx: number; gy: number; s?: number; color?: string }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shadow x={4} y={2} rx={20} ry={7} o={0.18} />
      <circle cx={-9} cy={-9} r={11} fill={darken(color, 0.15)} />
      <circle cx={9} cy={-9} r={12} fill={darken(color, 0.08)} />
      <circle cx={0} cy={-15} r={12} fill={color} />
      <circle cx={-4} cy={-19} r={5} fill={lighten(color, 0.35)} opacity={0.8} />
    </g>
  );
});

export const Flowers = memo(function Flowers({ gx, gy, colors = ["#ff8fab", "#ffd166", "#fff"] }: { gx: number; gy: number; colors?: string[] }) {
  const [x, y] = iso(gx, gy);
  const pos: [number, number][] = [[-12, 2], [-3, -3], [8, 1], [15, -4], [2, 6], [-8, 7]];
  return (
    <g transform={`translate(${x} ${y})`}>
      {pos.map(([a, b], i) => (
        <g key={i}>
          <line x1={a} y1={b} x2={a} y2={b - 7} stroke="#3c8f4b" strokeWidth={1.6} />
          <circle cx={a} cy={b - 9} r={3.6} fill={colors[i % colors.length]} />
          <circle cx={a} cy={b - 9} r={1.3} fill="#ffef99" />
        </g>
      ))}
    </g>
  );
});

export const Rock = memo(function Rock({ gx, gy, s = 1 }: { gx: number; gy: number; s?: number }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shadow x={3} y={2} rx={18} ry={6} o={0.2} />
      <polygon points="-16,0 -12,-13 -2,-19 10,-14 17,-3 12,2" fill="#8c98a8" />
      <polygon points="-2,-19 10,-14 17,-3 4,-6" fill="#a9b4c2" />
      <polygon points="-16,0 -12,-13 -2,-19 -4,-6" fill="#a2adba" />
    </g>
  );
});

// ── lampa, smerovník, lavička ───────────────────────────────────────────────

export const Lamp = memo(function Lamp({ gx, gy }: { gx: number; gy: number }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={4} y={2} rx={10} ry={4} o={0.22} />
      <rect x={-2} y={-64} width={4} height={64} fill="#2b3548" />
      <rect x={-6} y={-6} width={12} height={6} rx={2} fill="#3a465e" />
      <path d="M-9,-66 L9,-66 L6,-80 L-6,-80 Z" fill="#2b3548" />
      <rect x={-6} y={-78} width={12} height={12} rx={2} className="ag-lamp-glass" fill="#ffe9a8" />
      <polygon points="-9,-80 0,-88 9,-80" fill="#2b3548" />
    </g>
  );
});

export const Signpost = memo(function Signpost({
  gx,
  gy,
  label,
  color,
  sub,
}: {
  gx: number;
  gy: number;
  label: string;
  color: string;
  sub?: string;
}) {
  const [x, y] = iso(gx, gy);
  const w = Math.max(96, label.length * 7.4 + 30, (sub?.length ?? 0) * 5.6 + 30);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={6} y={2} rx={16} ry={5} o={0.22} />
      <rect x={-3} y={-74} width={6} height={74} rx={2} fill="#7a5233" />
      <rect x={0.5} y={-74} width={2.5} height={74} fill="#5c3c24" />
      <g transform="translate(0 -70)">
        <rect x={-w / 2} y={-30} width={w} height={34} rx={7} fill="#f6ead6" stroke="#8a5a3b" strokeWidth={2} />
        <rect x={-w / 2} y={-30} width={9} height={34} rx={4} fill={color} />
        <text x={4} y={-14} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#3b2a1c" fontFamily="var(--font-sans), system-ui, sans-serif">
          {label}
        </text>
        {sub && (
          <text x={4} y={-1} textAnchor="middle" fontSize={9.5} fill="#7c6549" fontFamily="var(--font-sans), system-ui, sans-serif">
            {sub}
          </text>
        )}
      </g>
    </g>
  );
});

export const Bench = memo(function Bench({ gx, gy, along = "y" }: { gx: number; gy: number; along?: "x" | "y" }) {
  const w = along === "x" ? 1.0 : 0.34;
  const d = along === "x" ? 0.34 : 1.0;
  return (
    <g>
      <Shadow x={iso(gx + w / 2, gy + d / 2)[0] + 4} y={iso(gx + w / 2, gy + d / 2)[1] + 2} rx={30} ry={10} o={0.18} />
      <IsoBox gx={gx + (along === "y" ? 0.03 : 0.08)} gy={gy + (along === "y" ? 0.08 : 0.03)} w={0.06} d={0.06} h={14} color="#5b3d28" />
      <IsoBox gx={gx + (along === "y" ? 0.25 : 0.86)} gy={gy + (along === "y" ? 0.86 : 0.25)} w={0.06} d={0.06} h={14} color="#5b3d28" />
      <IsoBox gx={gx} gy={gy} w={w} d={d} h={5} z={14} color="#b07b4f" />
      {/* opierka */}
      {along === "y" ? (
        <IsoBox gx={gx} gy={gy} w={0.06} d={d} h={16} z={18} color="#9c6a42" />
      ) : (
        <IsoBox gx={gx} gy={gy} w={w} d={0.06} h={16} z={18} color="#9c6a42" />
      )}
    </g>
  );
});

// ── fontána ────────────────────────────────────────────────────────────────

export const Fountain = memo(function Fountain({ gx, gy }: { gx: number; gy: number }) {
  const [x, y] = iso(gx, gy);
  const rx = circleRx(1.0);
  const ry = circleRy(1.0);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={8} y={6} rx={rx + 8} ry={ry + 4} o={0.2} />
      {/* misa */}
      <path d={`M${-rx},0 v-20 a${rx},${ry} 0 0 0 ${rx * 2},0 v20 a${rx},${ry} 0 0 1 ${-rx * 2},0 Z`} fill="#b9c2d0" />
      <path d={`M${-rx},0 v-20 a${rx},${ry} 0 0 0 ${rx},${ry} v20 a${rx},${ry} 0 0 1 ${-rx},${-ry} Z`} fill="#cfd7e3" opacity={0.6} />
      <ellipse cx={0} cy={-20} rx={rx} ry={ry} fill="#e6ecf5" />
      <ellipse cx={0} cy={-19} rx={rx - 9} ry={ry - 4.5} fill="url(#ag-water)" />
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={0} cy={-19} rx={rx - 12} ry={ry - 6} fill="none" stroke="#dff6ff" strokeWidth={1.4} className="ag-ripple" style={{ animationDelay: `${i * 0.9}s` }} />
      ))}
      {/* stĺp a horná misa */}
      <rect x={-6} y={-58} width={12} height={40} fill="#c6cfdc" />
      <rect x={0} y={-58} width={6} height={40} fill="#a9b3c3" />
      <ellipse cx={0} cy={-58} rx={26} ry={13} fill="#d6deea" />
      <ellipse cx={0} cy={-58} rx={20} ry={9.5} fill="url(#ag-water)" />
      <rect x={-3} y={-86} width={6} height={28} fill="#c6cfdc" />
      <ellipse cx={0} cy={-86} rx={9} ry={4.5} fill="#e6ecf5" />
      {/* prúdy vody */}
      <g fill="none" strokeLinecap="round">
        {[-1, 1].map((sg) => (
          <path key={sg} d={`M0,-88 Q${sg * 22},-112 ${sg * 30},-60`} stroke="#bfefff" strokeWidth={2.6} strokeDasharray="4 7" className="ag-jet" opacity={0.9} />
        ))}
        {[-1, 1].map((sg) => (
          <path key={sg} d={`M${sg * 24},-56 Q${sg * 50},-72 ${sg * 58},-26`} stroke="#bfefff" strokeWidth={2.2} strokeDasharray="3 7" className="ag-jet" style={{ animationDelay: "-0.6s" }} opacity={0.8} />
        ))}
      </g>
      <circle cx={0} cy={-94} r={2.4} fill="#fff" className="ag-twinkle" />
    </g>
  );
});

// ── pracovný stôl (Nora pri práci) ─────────────────────────────────────────

export const Workstation = memo(function Workstation({ gx, gy, working }: { gx: number; gy: number; working: boolean }) {
  // stôl 0.9 × 0.5 dlaždice, výška 30 px
  const w = 0.9;
  const d = 0.5;
  const h = 30;
  const scr = iso(gx + w / 2, gy + d / 2, h);
  return (
    <g>
      <Shadow x={iso(gx + w / 2, gy + d / 2)[0] + 6} y={iso(gx + w / 2, gy + d / 2)[1] + 3} rx={44} ry={13} o={0.2} />
      {/* nohy */}
      {[[0.04, 0.06], [w - 0.1, 0.06], [0.04, d - 0.1], [w - 0.1, d - 0.1]].map(([a, b], i) => (
        <IsoBox key={i} gx={gx + a} gy={gy + b} w={0.06} d={0.06} h={h - 4} color="#5b3d28" />
      ))}
      {/* predná doska (ukrýva nohy sediaceho) */}
      <IsoBox gx={gx} gy={gy + d - 0.04} w={w} d={0.04} h={h - 8} z={6} color="#a6754b" />
      {/* doska stola */}
      <IsoBox gx={gx} gy={gy} w={w} d={d} h={4} z={h - 4} color="#c48b58" top="#dba36f" />
      {/* notebook */}
      <g transform={`translate(${scr[0] - 4} ${scr[1] - 2})`}>
        <polygon points="-16,0 12,-8 26,-1 -2,7" fill="#aeb8c8" />
        <polygon points="-16,0 -2,7 -2,9 -16,2" fill="#8792a6" />
        <polygon points="-2,7 26,-1 26,1 -2,9" fill="#98a3b7" />
        {/* displej */}
        <polygon points="-16,0 -2,7 -2,-26 -16,-33" fill="#1d2433" />
        <polygon points="-14.5,-2 -3.5,3.5 -3.5,-24 -14.5,-30" className={working ? "ag-screen-on" : "ag-screen-off"} fill={working ? "#6fd3ff" : "#3a465e"} />
        {working && (
          <g className="ag-screen-lines" transform="skewY(26.5)">
            <rect x={-13.5} y={-26.5} width={8} height={1.6} fill="#fff" opacity={0.85} />
            <rect x={-13.5} y={-22.5} width={6} height={1.6} fill="#fff" opacity={0.7} />
            <rect x={-13.5} y={-18.5} width={9} height={1.6} fill="#fff" opacity={0.85} />
            <rect x={-13.5} y={-14.5} width={5} height={1.6} fill="#fff" opacity={0.6} />
          </g>
        )}
      </g>
      {/* hrnček */}
      <g transform={`translate(${iso(gx + 0.12, gy + 0.15, h)[0]} ${iso(gx + 0.12, gy + 0.15, h)[1]})`}>
        <ellipse cx={0} cy={0} rx={6} ry={3} fill="#f1f5f9" />
        <rect x={-6} y={-9} width={12} height={9} fill="#f8fafc" />
        <ellipse cx={0} cy={-9} rx={6} ry={3} fill="#7a4b2a" />
        <path d="M6,-7 q6,0 0,6" stroke="#f1f5f9" strokeWidth={2} fill="none" />
        <path d="M-2,-13 q-3,-5 0,-9 M2,-13 q3,-5 0,-9" stroke="#fff" strokeWidth={1.2} fill="none" opacity={0.5} className="ag-steam" />
      </g>
    </g>
  );
});

export const Chair = memo(function Chair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <IsoBox gx={gx} gy={gy} w={0.42} d={0.42} h={5} z={16} color="#3b4a66" />
      <IsoBox gx={gx + 0.04} gy={gy + 0.04} w={0.05} d={0.05} h={16} color="#2b3548" />
      <IsoBox gx={gx + 0.33} gy={gy + 0.04} w={0.05} d={0.05} h={16} color="#2b3548" />
      <IsoBox gx={gx} gy={gy} w={0.42} d={0.06} h={26} z={20} color="#324058" />
    </g>
  );
});

// ── schránka + stôl s konceptmi (čakanie na schválenie) ─────────────────────

export const ApprovalTable = memo(function ApprovalTable({
  gx,
  gy,
  count,
  waiting,
}: {
  gx: number;
  gy: number;
  count: number;
  waiting: boolean;
}) {
  const sheets = Math.max(0, Math.min(7, count));
  const top = iso(gx + 0.3, gy + 0.3, 24);
  return (
    <g>
      <Shadow x={iso(gx + 0.3, gy + 0.3)[0] + 4} y={iso(gx + 0.3, gy + 0.3)[1] + 2} rx={30} ry={10} o={0.2} />
      <IsoBox gx={gx} gy={gy} w={0.6} d={0.6} h={4} z={20} color="#c48b58" top="#dba36f" />
      <IsoBox gx={gx + 0.05} gy={gy + 0.05} w={0.06} d={0.06} h={20} color="#5b3d28" />
      <IsoBox gx={gx + 0.49} gy={gy + 0.05} w={0.06} d={0.06} h={20} color="#5b3d28" />
      <IsoBox gx={gx + 0.05} gy={gy + 0.49} w={0.06} d={0.06} h={20} color="#5b3d28" />
      <IsoBox gx={gx + 0.49} gy={gy + 0.49} w={0.06} d={0.06} h={20} color="#5b3d28" />
      {/* stoh papierov */}
      <g transform={`translate(${top[0]} ${top[1]})`}>
        {Array.from({ length: sheets }).map((_, i) => (
          <g key={i} transform={`translate(${(i % 2) * 1.6 - 0.8} ${-i * 3.4})`}>
            <polygon points="-15,0 0,-7.5 15,0 0,7.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.7} />
            <line x1={-8} y1={0.5} x2={4} y2={-5} stroke="#94a3b8" strokeWidth={0.8} />
            <line x1={-5} y1={2.4} x2={7} y2={-3.4} stroke="#94a3b8" strokeWidth={0.8} />
          </g>
        ))}
        {waiting && count > 0 && (
          <g transform={`translate(0 ${-sheets * 3.4 - 30})`}>
            <g className="ag-bounce">
              <circle r={count > 99 ? 15 : 13} fill="#f59e0b" stroke="#fff" strokeWidth={2.5} />
              <text y={4.6} textAnchor="middle" fontSize={count > 99 ? 10.5 : 12.5} fontWeight={800} fill="#fff" fontFamily="var(--font-sans), system-ui, sans-serif">
                {count > 99 ? "99+" : count}
              </text>
            </g>
          </g>
        )}
      </g>
    </g>
  );
});

export const Mailbox = memo(function Mailbox({ gx, gy, raised }: { gx: number; gy: number; raised: boolean }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={5} y={2} rx={12} ry={4} o={0.22} />
      <rect x={-2.5} y={-38} width={5} height={38} rx={2} fill="#6d4429" />
      <g transform="translate(0 -38)">
        <path d="M-14,0 L-14,-15 a14,12 0 0 1 28,0 L14,0 Z" fill="#3b82f6" />
        <path d="M0,0 L14,0 L14,-15 a14,12 0 0 0 -14,-12 Z" fill="#2563eb" />
        <rect x={-9} y={-9} width={12} height={3.4} rx={1.5} fill="#1e3a8a" />
        <g transform={`translate(14 -12) rotate(${raised ? -68 : 0})`} className="ag-flag">
          <rect x={0} y={-2} width={3} height={14} fill="#dc2626" />
          <rect x={0} y={-2} width={11} height={7} rx={1.5} fill="#ef4444" />
        </g>
      </g>
    </g>
  );
});

// ── plot ───────────────────────────────────────────────────────────────────

export const Fence = memo(function Fence({
  from,
  to,
  color = "#f3e5cf",
}: {
  from: [number, number];
  to: [number, number];
  color?: string;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(2, Math.round(len / 0.28));
  const posts = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const gx = from[0] + (to[0] - from[0]) * t;
    const gy = from[1] + (to[1] - from[1]) * t;
    return iso(gx, gy);
  });
  const rail = (z: number) =>
    `M${posts[0][0]},${posts[0][1] - z} ` + posts.slice(1).map(([px, py]) => `L${px},${py - z}`).join(" ");
  return (
    <g>
      <path d={rail(8)} stroke={darken(color, 0.15)} strokeWidth={3} fill="none" />
      <path d={rail(15)} stroke={darken(color, 0.1)} strokeWidth={3} fill="none" />
      {posts.map(([px, py], i) => (
        <g key={i}>
          <rect x={px - 2.2} y={py - 22} width={4.4} height={22} rx={1.4} fill={color} />
          <polygon points={`${px - 2.2},${py - 22} ${px},${py - 26} ${px + 2.2},${py - 22}`} fill={lighten(color, 0.3)} />
        </g>
      ))}
    </g>
  );
});

/** Zafarbenie pre prechody v mierke okolia (pre ozdoby, ktoré chcú zladiť farbu so štvrťou). */
export const tint = (base: string, color: string, t = 0.25) => mix(base, color, t);

// ── holografické čipy nad stolom (agent práve pracuje) ─────────────────────

const DEFAULT_CHIPS = [
  { text: "Zbieram dôkazy", color: "#fbbf24" },
  { text: "Overujem", color: "#4ade80" },
  { text: "Porovnávam", color: "#60a5fa" },
];
const CHIP_POS = [
  { dx: -62, dy: 0, delay: 0 },
  { dx: 6, dy: -26, delay: 2.1 },
  { dx: 40, dy: 4, delay: 4.2 },
];

export const HoloChips = memo(function HoloChips({ gx, gy, step, chips = DEFAULT_CHIPS }: { gx: number; gy: number; step?: string; chips?: { text: string; color: string }[] }) {
  const [x, y] = iso(gx + 0.45, gy + 0.25, 132);
  const label = step ? (step.length > 40 ? `${step.slice(0, 39)}…` : step) : null;
  return (
    <g transform={`translate(${x} ${y})`} style={{ pointerEvents: "none" }}>
      {label && (
        <g transform="translate(-22 -58)">
          <rect x={-6} y={-13} width={label.length * 5.7 + 24} height={22} rx={11} fill="#0d1524" opacity={0.92} stroke="#4ade80" strokeWidth={1.6} />
          <circle cx={6} cy={-2} r={3.6} fill="#4ade80" className="ag-pulse-dot" />
          <text x={15} y={2} fontSize={10.5} fontWeight={700} fill="#f1f5f9" fontFamily="var(--font-sans), system-ui, sans-serif">
            {label}
          </text>
        </g>
      )}
      {chips.slice(0, 3).map((c0, i) => {
        const c = { ...c0, ...CHIP_POS[i] };
        return (
        <g key={c.text} transform={`translate(${c.dx} ${c.dy})`}>
          <g className="ag-holo" style={{ animationDelay: `${c.delay}s` }}>
            <rect x={-6} y={-13} width={c.text.length * 5.7 + 24} height={22} rx={11} fill="#0d1524" opacity={0.86} stroke={c.color} strokeWidth={1.4} />
            <circle cx={6} cy={-2} r={3.6} fill={c.color} />
            <text x={15} y={2} fontSize={10.5} fontWeight={600} fill="#e8eefb" fontFamily="var(--font-sans), system-ui, sans-serif">
              {c.text}
            </text>
          </g>
        </g>
        );
      })}
    </g>
  );
});
