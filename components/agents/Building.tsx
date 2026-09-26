"use client";

// Operačný modul agenta (izometrická budova z ocele a skla so svetelnými pásmi) a prázdna parcela
// (holografický plán) pre budúceho agenta.

import { memo } from "react";
import { P, iso, mix } from "./iso";
import { IsoBox, Shadow } from "./Props";
import type { AgentStatus } from "@/lib/agents/registry";
import { STATUS_COLOR } from "@/lib/agents/registry";
import { TW } from "./iso";

export interface HouseGeom {
  gx: number;
  gy: number;
  w: number;
  d: number;
  /** výška múrov v px */
  H: number;
  /** rezerva (dnes nepoužitá, budova má plochú strechu) */
  RH: number;
}

export const HOUSE_H = 104;
export const HOUSE_RH = 58;

/** Okná modulu v plochých súradniciach steny (u, v od ľavého spodného rohu steny). */
interface Win {
  face: "A" | "B";
  u: number;
  v: number;
  w: number;
  h: number;
}

export function houseWindows(g: HouseGeom): Win[] {
  const wA = g.w * (TW / 2);
  const wB = g.d * (TW / 2);
  return [
    { face: "A", u: 8, v: 42, w: 30, h: 46 },
    { face: "A", u: wA - 38, v: 42, w: 30, h: 46 },
    { face: "B", u: 12, v: 42, w: 40, h: 46 },
    { face: "B", u: wB - 52, v: 42, w: 40, h: 46 },
  ];
}

const faceMatrix = (g: HouseGeom, face: "A" | "B") => {
  if (face === "A") {
    const [x, y] = iso(g.gx, g.gy + g.d, 0);
    return `translate(${x} ${y}) matrix(1 0.5 0 1 0 0)`;
  }
  const [x, y] = iso(g.gx + g.w, g.gy + g.d, 0);
  return `translate(${x} ${y}) matrix(1 -0.5 0 1 0 0)`;
};

const WALL_A = "#1b2749";
const WALL_B = "#111a36";
const SEAM = "#3a4d82";

export const House = memo(function House({
  g,
  name,
  status,
  accent,
  hover,
}: {
  g: HouseGeom;
  name: string;
  status: AgentStatus;
  accent: string;
  roof?: string;
  wall?: string;
  hover?: boolean;
}) {
  const { gx, gy, w, d, H } = g;
  const wA = w * (TW / 2);
  const wB = d * (TW / 2);
  const o = 0.12; // presah strechy (dlaždice)
  const active = status === "working" || status === "waiting";

  // rooftop
  const roofTop = H + 8;
  const rim = P([iso(gx - o, gy + d + o, roofTop), iso(gx + w + o, gy + d + o, roofTop), iso(gx + w + o, gy - o, roofTop)]);
  const radar = iso(gx + w * 0.72, gy + d * 0.34, roofTop + 14);
  const mast = iso(gx + w * 0.14, gy + d * 0.22, roofTop + 14);

  const doorW = 36;
  const doorH = 60;
  const doorU = wA / 2 - doorW / 2;

  const wins = houseWindows(g);
  const winEl = (win: Win, i: number) => (
    <g key={i} transform={`translate(${win.u} ${-win.v - win.h})`}>
      <rect x={-2.5} y={-2.5} width={win.w + 5} height={win.h + 5} rx={2} fill="#0a1226" stroke="#3f5390" strokeWidth={1} />
      <rect width={win.w} height={win.h} rx={1.5} fill="url(#ag-glass)" />
      {[1, 2].map((k) => (
        <line key={k} x1={(win.w / 3) * k} y1={0} x2={(win.w / 3) * k} y2={win.h} stroke="#0a1226" strokeWidth={1.4} opacity={0.8} />
      ))}
      <line x1={0} y1={win.h / 2} x2={win.w} y2={win.h / 2} stroke="#0a1226" strokeWidth={1.4} opacity={0.8} />
      <polygon points={`3,${win.h - 3} ${win.w * 0.42},3 ${win.w * 0.6},3 9,${win.h - 3}`} fill="#a5e8ff" opacity={0.1} />
      <rect x={-2.5} y={win.h + 2.5} width={win.w + 5} height={2} rx={1} fill={accent} opacity={0.9} />
    </g>
  );

  return (
    <g className={hover ? "ag-house ag-house-hover" : "ag-house"}>
      <Shadow x={iso(gx + w / 2 + 0.3, gy + d / 2 + 0.3)[0]} y={iso(gx + w / 2 + 0.3, gy + d / 2 + 0.3)[1] + 8} rx={w * 62} ry={w * 30} o={0.24} />
      {/* podstavec so svetelným lemom pri zemi */}
      <IsoBox gx={gx - 0.06} gy={gy - 0.06} w={w + 0.12} d={d + 0.12} h={9} color="#0f1731" top="#182346" />
      <polyline points={P([iso(gx - 0.06, gy + d + 0.06, 9), iso(gx + w + 0.06, gy + d + 0.06, 9), iso(gx + w + 0.06, gy - 0.06, 9)])} fill="none" stroke={accent} strokeWidth={2} opacity={0.85} strokeLinejoin="round" />

      {/* stena B (vpravo) */}
      <polygon points={P([iso(gx + w, gy + d, 9), iso(gx + w, gy, 9), iso(gx + w, gy, H), iso(gx + w, gy + d, H)])} fill={WALL_B} />
      <g transform={faceMatrix(g, "B")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={0} x2={wB} y1={-18 - i * 14} y2={-18 - i * 14} stroke={SEAM} strokeWidth={1} opacity={0.3} />
        ))}
        <rect x={0} y={-H} width={3} height={H - 9} fill={accent} opacity={0.9} />
        <rect x={0} y={-H} width={9} height={H - 9} fill={accent} opacity={0.1} />
        {wins.filter((x) => x.face === "B").map(winEl)}
      </g>

      {/* stena A (vľavo, čelná) */}
      <polygon points={P([iso(gx, gy + d, 9), iso(gx + w, gy + d, 9), iso(gx + w, gy + d, H), iso(gx, gy + d, H)])} fill={WALL_A} />
      <g transform={faceMatrix(g, "A")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={0} x2={wA} y1={-18 - i * 14} y2={-18 - i * 14} stroke={SEAM} strokeWidth={1} opacity={0.32} />
        ))}
        <rect x={0} y={-H} width={3} height={H - 9} fill={accent} opacity={0.9} />
        <rect x={0} y={-H} width={9} height={H - 9} fill={accent} opacity={0.1} />
        <rect x={wA - 3} y={-H} width={3} height={H - 9} fill={accent} opacity={0.9} />
        <rect x={wA - 9} y={-H} width={9} height={H - 9} fill={accent} opacity={0.1} />
        {wins.filter((x) => x.face === "A").map(winEl)}
        {/* posuvné dvere */}
        <g transform={`translate(${doorU} ${-doorH - 9})`}>
          <rect x={-3} y={-3} width={doorW + 6} height={doorH + 3} rx={2} fill="#0a1226" stroke={accent} strokeWidth={1.3} />
          <rect width={doorW / 2 - 0.6} height={doorH} fill="url(#ag-glass)" />
          <rect x={doorW / 2 + 0.6} width={doorW / 2 - 0.6} height={doorH} fill="url(#ag-glass)" />
          <polygon points={`3,${doorH - 4} ${doorW * 0.4},4 ${doorW * 0.55},4 8,${doorH - 4}`} fill="#a5e8ff" opacity={0.1} />
          <rect x={-3} y={-7} width={doorW + 6} height={2.4} rx={1.2} fill={accent} className={active ? "ag-twinkle" : undefined} />
        </g>
        {/* HUD štítok s menom */}
        <g transform={`translate(${wA / 2} ${-doorH - 9 - 22})`}>
          <rect x={-35} y={-10} width={70} height={20} rx={3} fill="#060d1d" stroke={accent} strokeWidth={1.2} />
          <rect x={-35} y={-10} width={4} height={20} rx={1.5} fill={accent} />
          <text x={-4} y={5} textAnchor="middle" fontSize={12.5} fontWeight={800} letterSpacing={1.6} fill="#eaf2ff" fontFamily="var(--font-sans), system-ui, sans-serif">
            {name.toUpperCase()}
          </text>
          <circle cx={26} cy={0} r={4.2} fill={STATUS_COLOR[status]} className={active ? "ag-pulse-dot" : undefined} />
          <circle cx={26} cy={0} r={7.4} fill="none" stroke={STATUS_COLOR[status]} strokeWidth={0.9} opacity={0.5} />
        </g>
      </g>

      {/* nájazd pri dverách */}
      <IsoBox gx={gx + w / 2 - 0.42} gy={gy + d} w={0.84} d={0.3} h={4} z={0} color="#182346" top="#22305a" />
      <polyline points={P([iso(gx + w / 2 - 0.42, gy + d + 0.3, 4), iso(gx + w / 2 + 0.42, gy + d + 0.3, 4)])} stroke={accent} strokeWidth={1.6} opacity={0.9} />

      {/* strecha: atika, technické nadstavby */}
      <IsoBox gx={gx - o} gy={gy - o} w={w + 2 * o} d={d + 2 * o} h={8} z={H} color="#1e2b53" top="#2b3c6c" />
      <polyline points={rim} fill="none" stroke={accent} strokeWidth={6} opacity={0.14} strokeLinejoin="round" />
      <polyline points={rim} fill="none" stroke={accent} strokeWidth={2} opacity={0.95} strokeLinejoin="round" className={active ? "ag-twinkle" : undefined} />
      <IsoBox gx={gx + 0.45} gy={gy + 0.4} w={w - 1.2} d={d - 0.9} h={12} z={roofTop} color="#16203f" top="#22305a" stroke="#0a1226" />
      {/* strešné okno */}
      <polygon points={P([iso(gx + 0.62, gy + 0.55, roofTop + 12.4), iso(gx + w - 0.9, gy + 0.55, roofTop + 12.4), iso(gx + w - 0.9, gy + d - 0.65, roofTop + 12.4), iso(gx + 0.62, gy + d - 0.65, roofTop + 12.4)])} fill="#0a2038" stroke={accent} strokeWidth={1} opacity={0.95} />
      <polygon points={P([iso(gx + 0.62, gy + 0.55, roofTop + 12.4), iso(gx + w - 0.9, gy + 0.55, roofTop + 12.4), iso(gx + w - 0.9, gy + d - 0.65, roofTop + 12.4), iso(gx + 0.62, gy + d - 0.65, roofTop + 12.4)])} fill={accent} opacity={active ? 0.18 : 0.08} className={active ? "ag-twinkle" : undefined} />

      {/* radar */}
      <g transform={`translate(${radar[0]} ${radar[1]})`}>
        <rect x={-1.6} y={-18} width={3.2} height={18} fill="#2c3a63" />
        <g transform="translate(0 -18) scale(1 0.5)">
          <ellipse cx={0} cy={0} rx={15} ry={15} fill={accent} opacity={0.08} />
          <circle cx={0} cy={0} r={15} fill="none" stroke={accent} strokeWidth={1.4} opacity={0.55} />
          <g className="ag-gear" style={{ animationDuration: active ? "2.2s" : "6s" }}>
            <circle cx={0} cy={0} r={15} fill="none" />
            <path d="M0,0 L15,0 A15,15 0 0 0 10.6,-10.6 Z" fill={accent} opacity={0.6} />
          </g>
        </g>
      </g>
      {/* anténa s majákom */}
      <g transform={`translate(${mast[0]} ${mast[1]})`}>
        <line x1={0} y1={0} x2={0} y2={-34} stroke="#6f86bd" strokeWidth={1.8} />
        <line x1={-5} y1={-24} x2={5} y2={-24} stroke="#6f86bd" strokeWidth={1.4} />
        <circle cx={0} cy={-36} r={2.8} fill={active ? "#fbbf24" : "#ef4444"} className="ag-pulse-dot" />
        <circle cx={0} cy={-36} r={8} fill={active ? "#fbbf24" : "#ef4444"} opacity={0.18} className="ag-ring" />
      </g>
    </g>
  );
});

/** Svetlá okien (kreslí sa nad zatmavením). */
export const HouseLights = memo(function HouseLights({ g, on }: { g: HouseGeom; on: boolean }) {
  const wins = houseWindows(g);
  return (
    <g style={{ opacity: on ? 1 : 0, transition: "opacity 1.4s ease" }}>
      {wins.map((win, i) => (
        <g key={i} transform={faceMatrix(g, win.face)}>
          <g transform={`translate(${win.u} ${-win.v - win.h})`}>
            <rect width={win.w} height={win.h} rx={1.5} fill="#5fd6ff" opacity={0.42} />
            <rect x={win.w / 3 - 0.7} width={1.4} height={win.h} fill="#0a1226" opacity={0.7} />
            <rect x={(win.w / 3) * 2 - 0.7} width={1.4} height={win.h} fill="#0a1226" opacity={0.7} />
            <rect y={win.h / 2 - 0.7} width={win.w} height={1.4} fill="#0a1226" opacity={0.7} />
            <rect x={-12} y={-12} width={win.w + 24} height={win.h + 24} fill="url(#ag-window-glow)" />
          </g>
        </g>
      ))}
    </g>
  );
});

// ── prázdna parcela ────────────────────────────────────────────────────────

export const EmptyPlot = memo(function EmptyPlot({
  gx,
  gy,
  w,
  d,
  color,
  hover,
  selected,
}: {
  gx: number;
  gy: number;
  w: number;
  d: number;
  color: string;
  hover?: boolean;
  selected?: boolean;
}) {
  const on = hover || selected;
  const corners = [iso(gx, gy), iso(gx + w, gy), iso(gx + w, gy + d), iso(gx, gy + d)] as [number, number][];
  const c = iso(gx + w / 2, gy + d / 2);
  const bh = 78; // výška ducha budúcej budovy
  const ins = 0.5;
  const ghostGx = gx + ins;
  const ghostGy = gy + ins;
  const gw = w - ins * 2;
  const gd = d - ins * 2;
  const wire = mix(color, "#ffffff", 0.25);
  const top = P([iso(ghostGx, ghostGy, bh), iso(ghostGx + gw, ghostGy, bh), iso(ghostGx + gw, ghostGy + gd, bh), iso(ghostGx, ghostGy + gd, bh)]);
  const faceA = P([iso(ghostGx, ghostGy + gd, 0), iso(ghostGx + gw, ghostGy + gd, 0), iso(ghostGx + gw, ghostGy + gd, bh), iso(ghostGx, ghostGy + gd, bh)]);
  const faceB = P([iso(ghostGx + gw, ghostGy + gd, 0), iso(ghostGx + gw, ghostGy, 0), iso(ghostGx + gw, ghostGy, bh), iso(ghostGx + gw, ghostGy + gd, bh)]);
  return (
    <g className="ag-plot" style={{ cursor: "pointer" }}>
      {/* zem parcely */}
      <polygon points={P(corners)} fill={color} opacity={on ? 0.2 : 0.09} style={{ transition: "opacity .25s" }} />
      <polygon points={P(corners)} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="10 8" opacity={on ? 1 : 0.65} className="ag-dash" />
      {/* mriežka výkresu */}
      {Array.from({ length: Math.floor(w) }).map((_, i) => {
        const a = iso(gx + i + 1, gy);
        const b = iso(gx + i + 1, gy + d);
        return <line key={"x" + i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.8} opacity={0.2} />;
      })}
      {Array.from({ length: Math.floor(d) }).map((_, i) => {
        const a = iso(gx, gy + i + 1);
        const b = iso(gx + w, gy + i + 1);
        return <line key={"y" + i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.8} opacity={0.2} />;
      })}
      {/* rohové majáky */}
      {corners.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <line x1={0} y1={0} x2={0} y2={-22} stroke={color} strokeWidth={1.6} opacity={0.8} />
          <circle cx={0} cy={-24} r={2.6} fill={color} className="ag-twinkle" style={{ animationDelay: `${i * 0.35}s` }} />
          <circle cx={0} cy={-24} r={7} fill={color} opacity={0.14} />
        </g>
      ))}
      {/* drôtený model budúcej budovy */}
      <g style={{ opacity: on ? 0.95 : 0.55, transition: "opacity .3s" }} strokeLinejoin="round">
        <polygon points={faceB} fill={color} fillOpacity={0.05} stroke={wire} strokeWidth={1} strokeDasharray="5 4" />
        <polygon points={faceA} fill={color} fillOpacity={0.08} stroke={wire} strokeWidth={1} strokeDasharray="5 4" />
        <polygon points={top} fill={color} fillOpacity={0.12} stroke={wire} strokeWidth={1.2} />
      </g>
      {/* plus */}
      <g transform={`translate(${c[0]} ${c[1] - bh - 46})`}>
        <g className="ag-bob">
          <circle r={16} fill="#07101f" opacity={0.9} />
          <circle r={16} fill="none" stroke={color} strokeWidth={1.8} opacity={on ? 1 : 0.8} />
          <circle r={21} fill="none" stroke={color} strokeWidth={0.8} strokeDasharray="3 5" opacity={0.6} className="ag-dash" />
          <path d="M-6,0 H6 M0,-6 V6" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
});
