"use client";

// Objekty operačného centra: energetické piliere, svetelné stožiare, HUD smerovníky, holografické jadro,
// pracovná konzola, dátový terminál, energetická bariéra…
// Všetko je čistý SVG kreslený v súradniciach scény (pozri iso.ts), počiatok objektu je pri zemi.

import { memo } from "react";
import { P, iso, circleRx, circleRy, darken, lighten, mix } from "./iso";

// ── základné telesá ─────────────────────────────────────────────────────────

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
      <polygon points={B} fill={darken(color, 0.28)} />
      <polygon points={T} fill={top ?? lighten(color, 0.14)} />
    </g>
  );
}

/** Kváder v lokálnych súradniciach objektu (polovičná uhlopriečka pôdorysu = w). Ľavá stena je svetlejšia. */
function Prism({ w, h, z = 0, color, top, edge }: { w: number; h: number; z?: number; color: string; top?: string; edge?: string }) {
  const b = -z;
  const L = `${-w},${b} 0,${b + w / 2} 0,${b + w / 2 - h} ${-w},${b - h}`;
  const R = `0,${b + w / 2} ${w},${b} ${w},${b - h} 0,${b + w / 2 - h}`;
  const T = `${-w},${b - h} 0,${b + w / 2 - h} ${w},${b - h} 0,${b - w / 2 - h}`;
  return (
    <g strokeLinejoin="round">
      <polygon points={L} fill={color} />
      <polygon points={R} fill={darken(color, 0.3)} />
      <polygon points={T} fill={top ?? lighten(color, 0.16)} />
      {edge && <polyline points={`${-w},${b - h} 0,${b + w / 2 - h} ${w},${b - h}`} fill="none" stroke={edge} strokeWidth={1.3} opacity={0.9} />}
    </g>
  );
}

/** mäkký tieň pod objektom */
export function Shadow({ x = 0, y = 0, rx, ry, o = 0.2 }: { x?: number; y?: number; rx: number; ry: number; o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#02050d" opacity={Math.min(0.85, o * 2.2)} />;
}

// ── piliere (bývalé stromy) ─────────────────────────────────────────────────

export type TreeKind = "round" | "pine" | "blossom" | "autumn" | "teal";

const ACCENT: Record<TreeKind, string> = {
  round: "#34d399",
  pine: "#22d3ee",
  blossom: "#e879f9",
  autumn: "#fbbf24",
  teal: "#22d3ee",
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
  const c = ACCENT[kind];
  const delay = -((seed * 1.7) % 5);
  const steel = "#18234a";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shadow x={10} y={3} rx={30} ry={10} o={0.2} />
      <ellipse cx={0} cy={2} rx={24} ry={9.5} fill={c} opacity={0.14} className="ag-twinkle" style={{ animationDelay: `${delay}s` }} />
      <Prism w={17} h={5} color="#0f1834" top="#1b2a52" edge={c} />

      {kind === "pine" || kind === "teal" ? (
        // serverová veža
        <g>
          <Prism w={13} h={62} z={5} color={steel} top="#26386b" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <line x1={-11} y1={-15 - i * 9.5} x2={-1.5} y2={-10.5 - i * 9.5} stroke="#0b1226" strokeWidth={1.2} />
              <rect x={-9.4} y={-14.6 - i * 9.5 + 3.4} width={2.4} height={1.6} rx={0.8} fill={i % 3 === 0 ? "#fbbf24" : c} className="ag-twinkle" style={{ animationDelay: `${(i * 0.37 + seed) % 2}s` }} />
              <rect x={-5.8} y={-14.6 - i * 9.5 + 5.2} width={2.4} height={1.6} rx={0.8} fill={c} className="ag-twinkle" style={{ animationDelay: `${(i * 0.53 + seed) % 2}s` }} />
            </g>
          ))}
          <line x1={0} y1={-83} x2={0} y2={-104} stroke="#6f86bd" strokeWidth={1.6} />
          <circle cx={0} cy={-105} r={2.6} fill={c} className="ag-pulse-dot" />
        </g>
      ) : kind === "autumn" ? (
        // reaktorový stĺp
        <g>
          <path d="M-13,-8 v-56 a13,5.4 0 0 1 26,0 v56 a13,5.4 0 0 1 -26,0 Z" fill={steel} />
          <path d="M0,-8 v-56 a13,5.4 0 0 0 13,0 v56 a13,5.4 0 0 1 -13,0 Z" fill={darken(steel, 0.32)} />
          <ellipse cx={0} cy={-64} rx={13} ry={5.4} fill="#26386b" />
          <rect x={-3.5} y={-58} width={7} height={46} rx={3.5} fill={c} opacity={0.92} className="ag-twinkle" style={{ animationDelay: `${delay}s` }} />
          <rect x={-1.4} y={-58} width={2.8} height={46} rx={1.4} fill="#fff7d6" />
          {[-24, -40, -54].map((yy, i) => (
            <ellipse key={i} cx={0} cy={yy} rx={14.4} ry={6} fill="none" stroke={c} strokeWidth={1.5} opacity={0.75} />
          ))}
          <ellipse cx={0} cy={-88} rx={13} ry={5} fill={c} opacity={0.18} className="ag-bob" />
          <polygon points="0,-104 6,-92 0,-80 -6,-92" fill={c} className="ag-bob" />
        </g>
      ) : kind === "blossom" ? (
        // kryštálová veža
        <g>
          <Prism w={9} h={16} z={5} color="#22214c" top="#3a3478" edge={c} />
          <g className="ag-bob" style={{ animationDelay: `${delay}s` }}>
            <polygon points="0,-112 11,-82 0,-52 -11,-82" fill={c} />
            <polygon points="0,-112 11,-82 0,-52" fill={darken(c, 0.25)} />
            <polygon points="0,-112 -11,-82 -3,-84" fill="#fff" opacity={0.55} />
            <circle cx={0} cy={-82} r={30} fill={c} opacity={0.12} />
          </g>
          <ellipse cx={0} cy={-38} rx={18} ry={6.5} fill="none" stroke={c} strokeWidth={1.4} strokeDasharray="4 6" opacity={0.8} className="ag-dash" />
          <line x1={0} y1={-20} x2={0} y2={-50} stroke={c} strokeWidth={1.6} opacity={0.6} />
        </g>
      ) : (
        // dátové jadro
        <g>
          <path d="M-9,-10 v-14 a9,3.8 0 0 1 18,0 v14 a9,3.8 0 0 1 -18,0 Z" fill={steel} />
          <ellipse cx={0} cy={-24} rx={9} ry={3.8} fill="#26386b" />
          <g className="ag-bob" style={{ animationDelay: `${delay}s` }}>
            <circle cx={0} cy={-56} r={26} fill={c} opacity={0.12} />
            <circle cx={0} cy={-56} r={19} fill="#0b1c30" stroke={c} strokeWidth={1.6} />
            <circle cx={-5} cy={-62} r={7} fill={c} opacity={0.35} />
            <ellipse cx={0} cy={-56} rx={19} ry={6.6} fill="none" stroke={c} strokeWidth={1.2} opacity={0.9} />
            <ellipse cx={0} cy={-56} rx={7} ry={19} fill="none" stroke={c} strokeWidth={1} opacity={0.6} />
            <ellipse cx={0} cy={-56} rx={31} ry={10} fill="none" stroke="#ffffff" strokeWidth={1} strokeDasharray="3 7" opacity={0.55} className="ag-dash" />
          </g>
        </g>
      )}
    </g>
  );
});

export const Bush = memo(function Bush({ gx, gy, s = 1 }: { gx: number; gy: number; s?: number; color?: string }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shadow x={4} y={2} rx={16} ry={6} o={0.18} />
      <Prism w={11} h={11} color="#18234a" top="#26386b" edge="#22d3ee" />
      {[0, 1, 2].map((i) => (
        <line key={i} x1={-9} y1={-2 - i * 3.2 + 0.6} x2={-1.5} y2={1.6 - i * 3.2 + 0.6} stroke="#0a1024" strokeWidth={1.1} />
      ))}
      <rect x={3} y={-9} width={4} height={1.6} rx={0.8} fill="#67e8f9" className="ag-twinkle" />
    </g>
  );
});

export const Flowers = memo(function Flowers({ gx, gy, colors = ["#22d3ee", "#fbbf24", "#e879f9"] }: { gx: number; gy: number; colors?: string[] }) {
  const [x, y] = iso(gx, gy);
  const pos: [number, number][] = [[-12, 2], [-3, -3], [8, 1], [15, -4], [2, 6], [-8, 7]];
  return (
    <g transform={`translate(${x} ${y})`}>
      {pos.map(([a, b], i) => (
        <g key={i}>
          <line x1={a} y1={b} x2={a} y2={b - 7} stroke="#3b4f86" strokeWidth={1.6} />
          <circle cx={a} cy={b - 9} r={3.4} fill={colors[i % colors.length]} className="ag-twinkle" style={{ animationDelay: `${i * 0.45}s` }} />
          <circle cx={a} cy={b - 9} r={7} fill={colors[i % colors.length]} opacity={0.14} />
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
      <Prism w={15} h={15} color="#1f2c52" top="#324578" />
      <polygon points="-15,-4 -6,0.5 -6,-3.5 -15,-8" fill="#fbbf24" opacity={0.9} />
      <line x1={-15} y1={-10.5} x2={0} y2={-3} stroke="#0a1024" strokeWidth={1} opacity={0.6} />
    </g>
  );
});

// ── stožiar, HUD smerovník, konzola ─────────────────────────────────────────

export const Lamp = memo(function Lamp({ gx, gy }: { gx: number; gy: number }) {
  const [x, y] = iso(gx, gy);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={4} y={2} rx={10} ry={4} o={0.22} />
      <Prism w={6} h={5} color="#18234a" top="#26386b" />
      <rect x={-1.8} y={-70} width={3.6} height={66} fill="#2c3a63" />
      <rect x={0} y={-70} width={1.8} height={66} fill="#1b2649" />
      <rect x={-9} y={-76} width={18} height={6} rx={2} fill="#1d2a4f" />
      <rect x={-7} y={-72.4} width={14} height={2.8} rx={1.4} className="ag-lamp-glass" fill="#d9fbff" />
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
  const w = Math.max(104, label.length * 7.6 + 34, (sub?.length ?? 0) * 5.6 + 34);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={6} y={2} rx={14} ry={5} o={0.22} />
      <rect x={-2} y={-72} width={4} height={72} rx={1} fill="#2c3a63" />
      <rect x={0} y={-72} width={2} height={72} fill="#1b2649" />
      <g transform="translate(0 -68)">
        <rect x={-w / 2 - 3} y={-31} width={w + 6} height={40} rx={4} fill={color} opacity={0.1} />
        <rect x={-w / 2} y={-28} width={w} height={34} rx={3} fill="#0a1229" stroke={color} strokeWidth={1.3} opacity={0.97} />
        <rect x={-w / 2} y={-28} width={5} height={34} rx={1.5} fill={color} />
        <path d={`M${w / 2 - 9},-28 h9 v9`} fill="none" stroke={color} strokeWidth={1.4} opacity={0.9} />
        <text x={3} y={-13} textAnchor="middle" fontSize={11.5} fontWeight={700} letterSpacing={0.5} fill="#e8f0ff" fontFamily="var(--font-sans), system-ui, sans-serif">
          {label}
        </text>
        {sub && (
          <text x={3} y={-1.5} textAnchor="middle" fontSize={8.6} letterSpacing={0.3} fill="#7f93c4" fontFamily="var(--font-sans), system-ui, sans-serif">
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
      <IsoBox gx={gx} gy={gy} w={w} d={d} h={14} color="#18234a" top="#26386b" />
      {along === "y" ? (
        <IsoBox gx={gx + 0.02} gy={gy + 0.08} w={0.06} d={d - 0.16} h={2} z={14} color="#22d3ee" top="#7ce9ff" />
      ) : (
        <IsoBox gx={gx + 0.08} gy={gy + 0.02} w={w - 0.16} d={0.06} h={2} z={14} color="#22d3ee" top="#7ce9ff" />
      )}
    </g>
  );
});

// ── holografické jadro (stred paluby) ──────────────────────────────────────

export const HoloCore = memo(function HoloCore({ gx, gy }: { gx: number; gy: number }) {
  const [x, y] = iso(gx, gy);
  const rx = circleRx(0.95);
  const ry = circleRy(0.95);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={6} y={6} rx={rx + 6} ry={ry + 3} o={0.2} />
      {/* podstavec */}
      <path d={`M${-rx},0 v-12 a${rx},${ry} 0 0 0 ${rx * 2},0 v12 a${rx},${ry} 0 0 1 ${-rx * 2},0 Z`} fill="#141f42" />
      <path d={`M0,${ry} v-12 a${rx},${ry} 0 0 0 ${rx},-${ry} v12 a${rx},${ry} 0 0 1 ${-rx},${ry} Z`} fill="#0c1430" />
      <ellipse cx={0} cy={-12} rx={rx} ry={ry} fill="#0f1a38" stroke="#5fe0ff" strokeWidth={1.8} />
      <ellipse cx={0} cy={-12} rx={rx * 0.7} ry={ry * 0.7} fill="#0a1226" stroke="#2e4278" strokeWidth={1} />
      <ellipse cx={0} cy={-12} rx={rx * 0.5} ry={ry * 0.5} fill="url(#ag-water)" opacity={0.55} />
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={0} cy={-12} rx={rx * 0.6} ry={ry * 0.6} fill="none" stroke="#c8faff" strokeWidth={1.3} className="ag-ripple" style={{ animationDelay: `${i * 0.9}s` }} />
      ))}
      {/* lúč */}
      <polygon points="-15,-12 15,-12 8,-104 -8,-104" fill="url(#ag-beam)" />
      {/* glóbus */}
      <g className="ag-bob">
        <circle cx={0} cy={-106} r={34} fill="#22d3ee" opacity={0.08} />
        <circle cx={0} cy={-106} r={25} fill="#08172c" fillOpacity={0.78} stroke="#67e8f9" strokeWidth={1.6} />
        <circle cx={-6} cy={-113} r={9} fill="#67e8f9" opacity={0.18} />
        <ellipse cx={0} cy={-106} rx={25} ry={7.5} fill="none" stroke="#67e8f9" strokeWidth={1} opacity={0.75} />
        <ellipse cx={0} cy={-106} rx={25} ry={16} fill="none" stroke="#67e8f9" strokeWidth={0.8} opacity={0.4} />
        <ellipse cx={0} cy={-106} rx={25} ry={25} fill="none" stroke="#67e8f9" strokeWidth={0} />
        {[0, 1, 2].map((i) => (
          <ellipse key={i} cx={0} cy={-106} rx={25} ry={25} fill="none" stroke="#67e8f9" strokeWidth={1} opacity={0.55} className="ag-meridian" style={{ animationDelay: `${-i * 1.6}s` }} />
        ))}
        <ellipse cx={0} cy={-106} rx={44} ry={12} fill="none" stroke="#e6fbff" strokeWidth={1.1} strokeDasharray="3 8" opacity={0.7} className="ag-dash" />
        <circle cx={0} cy={-106} r={2.2} fill="#fff" className="ag-twinkle" />
      </g>
    </g>
  );
});

// ── pracovná konzola (agent pri práci) ─────────────────────────────────────

export const Workstation = memo(function Workstation({ gx, gy, working }: { gx: number; gy: number; working: boolean }) {
  const w = 0.9;
  const d = 0.5;
  const h = 30;
  const scr = iso(gx + w / 2, gy + d / 2, h);
  return (
    <g>
      <Shadow x={iso(gx + w / 2, gy + d / 2)[0] + 6} y={iso(gx + w / 2, gy + d / 2)[1] + 3} rx={42} ry={13} o={0.2} />
      <IsoBox gx={gx} gy={gy} w={w} d={d} h={h - 4} color="#141d3a" top="#1f2c54" />
      <IsoBox gx={gx} gy={gy} w={w} d={d} h={4} z={h - 4} color="#26365f" top="#33467a" stroke="#0a1024" />
      {/* svetelný pás na prednej hrane */}
      <IsoBox gx={gx + 0.05} gy={gy + d - 0.02} w={w - 0.1} d={0.03} h={2} z={9} color={working ? "#7ce9ff" : "#3b4f86"} top="#9df2ff" />
      {/* dva displeje */}
      {[-13, 15].map((off, k) => (
        <g key={k} transform={`translate(${scr[0] + off} ${scr[1] - 3 + (k ? -2 : 0)})`}>
          <polygon points="-11,0 3,7 3,-22 -11,-29" fill="#0a1024" />
          <polygon points="-9.6,-2 1.7,3.6 1.7,-19.6 -9.6,-25.4" className={working ? "ag-screen-on" : "ag-screen-off"} fill={working ? "#4fd8ff" : "#22305a"} />
          {working && (
            <g className="ag-screen-lines" transform="skewY(26.5)">
              <rect x={-8.4} y={-21.5} width={7} height={1.5} fill="#e6fbff" opacity={0.9} />
              <rect x={-8.4} y={-17.8} width={5} height={1.5} fill="#e6fbff" opacity={0.7} />
              <rect x={-8.4} y={-14.1} width={7.6} height={1.5} fill="#e6fbff" opacity={0.85} />
              <rect x={-8.4} y={-10.4} width={4} height={1.5} fill="#e6fbff" opacity={0.6} />
            </g>
          )}
        </g>
      ))}
    </g>
  );
});

export const Chair = memo(function Chair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <IsoBox gx={gx + 0.1} gy={gy + 0.1} w={0.22} d={0.22} h={14} color="#1a2444" />
      <IsoBox gx={gx} gy={gy} w={0.42} d={0.42} h={5} z={14} color="#26365f" top="#33467a" />
      <IsoBox gx={gx} gy={gy} w={0.42} d={0.07} h={28} z={19} color="#1d2a4f" top="#2a3a68" />
      <IsoBox gx={gx + 0.02} gy={gy + 0.005} w={0.38} d={0.02} h={2} z={44} color="#22d3ee" top="#7ce9ff" />
    </g>
  );
});

// ── dátový terminál + holografický podnos so schválením ─────────────────────

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
      <Shadow x={iso(gx + 0.3, gy + 0.3)[0] + 4} y={iso(gx + 0.3, gy + 0.3)[1] + 2} rx={28} ry={10} o={0.2} />
      <IsoBox gx={gx + 0.06} gy={gy + 0.06} w={0.48} d={0.48} h={20} color="#141d3a" top="#1f2c54" />
      <IsoBox gx={gx} gy={gy} w={0.6} d={0.6} h={4} z={20} color="#26365f" top="#33467a" stroke="#22d3ee" />
      {/* holografické karty */}
      <g transform={`translate(${top[0]} ${top[1]})`}>
        {waiting && <ellipse cx={0} cy={0} rx={22} ry={9} fill="#fbbf24" opacity={0.18} className="ag-twinkle" />}
        {Array.from({ length: sheets }).map((_, i) => (
          <g key={i} transform={`translate(${(i % 2) * 1.6 - 0.8} ${-i * 3.4})`}>
            <polygon points="-15,0 0,-7.5 15,0 0,7.5" fill="#0d2a44" fillOpacity={0.85} stroke="#67e8f9" strokeWidth={0.9} />
            <line x1={-8} y1={0.5} x2={4} y2={-5} stroke="#67e8f9" strokeWidth={0.8} opacity={0.8} />
            <line x1={-5} y1={2.4} x2={7} y2={-3.4} stroke="#67e8f9" strokeWidth={0.8} opacity={0.6} />
          </g>
        ))}
        {waiting && count > 0 && (
          <g transform={`translate(0 ${-sheets * 3.4 - 30})`}>
            <g className="ag-bounce">
              <circle r={count > 99 ? 15 : 13} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
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
  const c = raised ? "#fbbf24" : "#34d399";
  return (
    <g transform={`translate(${x} ${y})`}>
      <Shadow x={5} y={2} rx={12} ry={4} o={0.22} />
      <Prism w={7} h={4} color="#18234a" top="#26386b" />
      <rect x={-2} y={-40} width={4} height={38} rx={1.5} fill="#2c3a63" />
      <g transform="translate(0 -40)">
        <rect x={-11} y={-16} width={22} height={17} rx={3} fill="#111b3b" stroke="#3b4f86" strokeWidth={1.2} />
        <rect x={-8} y={-13} width={16} height={8} rx={1.5} fill="#08172c" />
        <line x1={-6} y1={-10} x2={4} y2={-10} stroke="#67e8f9" strokeWidth={1} opacity={0.8} />
        <line x1={-6} y1={-7.6} x2={0} y2={-7.6} stroke="#67e8f9" strokeWidth={1} opacity={0.6} />
        <circle cx={0} cy={-2.4} r={1.8} fill={c} className={raised ? "ag-pulse-dot" : undefined} />
        <line x1={7} y1={-16} x2={7} y2={-26} stroke="#6f86bd" strokeWidth={1.4} />
        <circle cx={7} cy={-27.5} r={2.6} fill={c} className={raised ? "ag-pulse-dot" : undefined} />
        {raised && <circle cx={7} cy={-27.5} r={8} fill={c} opacity={0.2} className="ag-ring" />}
      </g>
    </g>
  );
});

// ── energetická bariéra ─────────────────────────────────────────────────────

export const Fence = memo(function Fence({
  from,
  to,
  color = "#22d3ee",
}: {
  from: [number, number];
  to: [number, number];
  color?: string;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(2, Math.round(len / 0.55));
  const posts = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const gx = from[0] + (to[0] - from[0]) * t;
    const gy = from[1] + (to[1] - from[1]) * t;
    return iso(gx, gy);
  });
  const rail = (z: number) => `M${posts[0][0]},${posts[0][1] - z} ` + posts.slice(1).map(([px, py]) => `L${px},${py - z}`).join(" ");
  return (
    <g>
      <path d={rail(13)} stroke={color} strokeWidth={5} fill="none" opacity={0.1} />
      <path d={rail(13)} stroke={color} strokeWidth={1.4} fill="none" opacity={0.7} />
      <path d={rail(5)} stroke={color} strokeWidth={1} fill="none" opacity={0.35} strokeDasharray="4 6" />
      {posts.map(([px, py], i) => (
        <g key={i}>
          <rect x={px - 1.8} y={py - 17} width={3.6} height={17} rx={1} fill="#2c3a63" />
          <circle cx={px} cy={py - 18} r={2} fill={color} className="ag-twinkle" style={{ animationDelay: `${(i * 0.3) % 2}s` }} />
        </g>
      ))}
    </g>
  );
});

/** Zafarbenie pre prechody v mierke okolia (pre ozdoby, ktoré chcú zladiť farbu so štvrťou). */
export const tint = (base: string, color: string, t = 0.25) => mix(base, color, t);

// ── holografické čipy nad konzolou (agent práve pracuje) ────────────────────

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
          <rect x={-6} y={-13} width={label.length * 5.7 + 24} height={22} rx={4} fill="#07101f" opacity={0.94} stroke="#4ade80" strokeWidth={1.3} />
          <circle cx={6} cy={-2} r={3.2} fill="#4ade80" className="ag-pulse-dot" />
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
              <rect x={-6} y={-13} width={c.text.length * 5.7 + 24} height={22} rx={4} fill="#07101f" opacity={0.88} stroke={c.color} strokeWidth={1.2} />
              <rect x={-6} y={-13} width={3} height={22} rx={1.5} fill={c.color} />
              <circle cx={7} cy={-2} r={3} fill={c.color} />
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
