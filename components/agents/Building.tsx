"use client";

// Domček agenta (izometrický ateliér) a prázdna parcela pre budúceho agenta.

import { memo } from "react";
import { P, iso, darken, lighten, mix, TW } from "./iso";
import { IsoBox, Shadow } from "./Props";
import type { AgentStatus } from "@/lib/agents/registry";
import { STATUS_COLOR } from "@/lib/agents/registry";

export interface HouseGeom {
  gx: number;
  gy: number;
  w: number;
  d: number;
  /** výška múrov v px */
  H: number;
  /** výška strechy v px */
  RH: number;
}

export const HOUSE_H = 104;
export const HOUSE_RH = 58;

/** Okná domu v plochých súradniciach steny (u, v od ľavého spodného rohu steny). */
interface Win {
  face: "A" | "B";
  u: number;
  v: number;
  w: number;
  h: number;
  round?: boolean;
}

export function houseWindows(g: HouseGeom): Win[] {
  const wA = g.w * (TW / 2);
  const wB = g.d * (TW / 2);
  return [
    { face: "A", u: wA * 0.13, v: 52, w: 34, h: 40 },
    { face: "A", u: wA * 0.87 - 34, v: 52, w: 34, h: 40 },
    { face: "B", u: wB * 0.2, v: 50, w: 30, h: 38 },
    { face: "B", u: wB * 0.62, v: 50, w: 30, h: 38 },
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

export const House = memo(function House({
  g,
  name,
  status,
  accent,
  roof = "#d96a35",
  wall = "#f4e7d1",
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
  const { gx, gy, w, d, H, RH } = g;
  const wA = w * (TW / 2);
  const wB = d * (TW / 2);
  const o = 0.28; // presah strechy (dlaždice)
  const mid = gy + d / 2;
  const roofA = roof;
  const roofDark = darken(roof, 0.2);

  // strecha (štítová, hrebeň v smere osi x)
  const slopeFront = P([
    iso(gx - o, gy + d + o, H),
    iso(gx + w + o, gy + d + o, H),
    iso(gx + w + o, mid, H + RH),
    iso(gx - o, mid, H + RH),
  ]);
  const gable = P([iso(gx + w, gy + d, H), iso(gx + w, gy, H), iso(gx + w, mid, H + RH)]);
  // hrana strechy (čelný okraj pri +x)
  const fascia = P([
    iso(gx + w + o, gy + d + o, H),
    iso(gx + w + o, gy - o, H),
    iso(gx + w + o, gy - o, H - 6),
    iso(gx + w + o, gy + d + o, H - 6),
  ]);
  const backSlope = P([
    iso(gx + w + o, mid, H + RH),
    iso(gx + w + o, gy - o, H),
    iso(gx - o, gy - o, H),
    iso(gx - o, mid, H + RH),
  ]);

  // riadky škridly
  const rows = 7;
  const tiles: React.ReactNode[] = [];
  for (let i = 1; i < rows; i++) {
    const t = i / rows;
    const gyi = gy + d + o - (d / 2 + o) * t;
    const zi = H + RH * t;
    const [x1, y1] = iso(gx - o, gyi, zi);
    const [x2, y2] = iso(gx + w + o, gyi, zi);
    tiles.push(<line key={"r" + i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={darken(roof, 0.28)} strokeWidth={1.3} opacity={0.55} />);
    // rozdelenie škridly (posunuté po riadkoch)
    const cols = 11;
    const gyPrev = gy + d + o - (d / 2 + o) * ((i - 1) / rows);
    const zPrev = H + RH * ((i - 1) / rows);
    for (let c = 0; c <= cols; c++) {
      const tx = (c + (i % 2 ? 0.5 : 0)) / cols;
      if (tx > 1) continue;
      const gxc = gx - o + (w + 2 * o) * tx;
      const [ax, ay] = iso(gxc, gyPrev, zPrev);
      const [bx, by] = iso(gxc, gyi, zi);
      tiles.push(<line key={`c${i}-${c}`} x1={ax} y1={ay} x2={bx} y2={by} stroke={darken(roof, 0.28)} strokeWidth={0.9} opacity={0.32} />);
    }
  }

  // komín
  const chGx = gx + w * 0.72;
  const chGy = gy + d * 0.34;
  const roofZAt = (gyv: number) => (gyv <= mid ? H + RH * ((gyv - (gy - o)) / (mid - (gy - o))) : H + RH * ((gy + d + o - gyv) / (gy + d + o - mid)));
  const chZ = roofZAt(chGy + 0.16) - 8;
  const chTop = iso(chGx + 0.16, chGy + 0.16, chZ + 66);

  // dvere na stene A
  const doorW = 34;
  const doorH = 66;
  const doorU = wA / 2 - doorW / 2;

  const wins = houseWindows(g);
  const winEl = (win: Win, i: number) => (
    <g key={i} transform={`translate(${win.u} ${-win.v - win.h})`}>
      <rect x={-4} y={-4} width={win.w + 8} height={win.h + 8} rx={3} fill="#fff8ea" stroke="#c9a273" strokeWidth={1.5} />
      <rect width={win.w} height={win.h} rx={2} fill="url(#ag-glass)" />
      <rect x={win.w / 2 - 1} width={2} height={win.h} fill="#fff8ea" />
      <rect y={win.h / 2 - 1} width={win.w} height={2} fill="#fff8ea" />
      {/* odraz */}
      <polygon points={`4,${win.h - 4} ${win.w * 0.45},4 ${win.w * 0.62},4 10,${win.h - 4}`} fill="#fff" opacity={0.22} />
      {/* kvetináč */}
      <rect x={-6} y={win.h + 4} width={win.w + 12} height={7} rx={2} fill="#a8683d" />
      {[0.15, 0.35, 0.55, 0.75, 0.92].map((t, k) => (
        <circle key={k} cx={t * win.w + (t < 0.5 ? -2 : 2)} cy={win.h + 3} r={3.4} fill={["#ff6f91", "#ffd166", "#fff", "#ff8fab", "#ffd166"][k]} />
      ))}
    </g>
  );

  return (
    <g className={hover ? "ag-house ag-house-hover" : "ag-house"}>
      <Shadow x={iso(gx + w / 2 + 0.4, gy + d / 2 + 0.4)[0]} y={iso(gx + w / 2 + 0.4, gy + d / 2 + 0.4)[1] + 8} rx={w * 62} ry={w * 30} o={0.22} />
      {/* základ */}
      <IsoBox gx={gx - 0.06} gy={gy - 0.06} w={w + 0.12} d={d + 0.12} h={9} color="#9aa3b2" top="#b4bcc9" />

      {/* stena B (vpravo) */}
      <polygon points={P([iso(gx + w, gy + d, 9), iso(gx + w, gy, 9), iso(gx + w, gy, H), iso(gx + w, gy + d, H)])} fill={darken(wall, 0.2)} />
      <g transform={faceMatrix(g, "B")}>
        {/* doska */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={i} x1={0} x2={wB} y1={-16 - i * 10} y2={-16 - i * 10} stroke={darken(wall, 0.36)} strokeWidth={1} opacity={0.35} />
        ))}
        <rect x={0} y={-H} width={5} height={H - 9} fill={darken(wall, 0.36)} opacity={0.4} />
        {wins.filter((x) => x.face === "B").map(winEl)}
      </g>

      {/* stena A (vľavo, čelná) */}
      <polygon points={P([iso(gx, gy + d, 9), iso(gx + w, gy + d, 9), iso(gx + w, gy + d, H), iso(gx, gy + d, H)])} fill={wall} />
      <g transform={faceMatrix(g, "A")}>
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={i} x1={0} x2={wA} y1={-16 - i * 10} y2={-16 - i * 10} stroke={darken(wall, 0.28)} strokeWidth={1} opacity={0.3} />
        ))}
        <rect x={0} y={-H} width={5} height={H - 9} fill={darken(wall, 0.28)} opacity={0.4} />
        <rect x={wA - 5} y={-H} width={5} height={H - 9} fill={darken(wall, 0.28)} opacity={0.4} />
        {wins.filter((x) => x.face === "A").map(winEl)}
        {/* dvere */}
        <g transform={`translate(${doorU} ${-doorH - 9})`}>
          <rect x={-5} y={-5} width={doorW + 10} height={doorH + 5} rx={3} fill="#fff8ea" stroke="#c9a273" strokeWidth={1.5} />
          <rect width={doorW} height={doorH} rx={2} fill={accent} />
          <rect x={4} y={5} width={doorW - 8} height={doorH * 0.36} rx={2} fill={darken(accent, 0.18)} />
          <rect x={4} y={doorH * 0.5} width={doorW - 8} height={doorH * 0.42} rx={2} fill={darken(accent, 0.18)} />
          <circle cx={doorW - 7} cy={doorH * 0.5} r={2.6} fill="#fde68a" />
        </g>
        {/* tabuľa s menom */}
        <g transform={`translate(${wA / 2} ${-doorH - 9 - 28})`}>
          <line x1={-30} y1={-4} x2={-30} y2={4} stroke="#6d4429" strokeWidth={2} />
          <line x1={30} y1={-4} x2={30} y2={4} stroke="#6d4429" strokeWidth={2} />
          <rect x={-42} y={-10} width={84} height={22} rx={5} fill="#5b3d28" stroke="#3b2618" strokeWidth={1.2} />
          <text x={-4} y={5.5} textAnchor="middle" fontSize={13} fontWeight={800} letterSpacing={1.4} fill="#fde7bd" fontFamily="var(--font-sans), system-ui, sans-serif">
            {name.toUpperCase()}
          </text>
          <circle cx={30} cy={1} r={5.2} fill={STATUS_COLOR[status]} stroke="#3b2618" strokeWidth={1.2} className={status === "working" || status === "waiting" ? "ag-pulse-dot" : undefined} />
        </g>
      </g>

      {/* schodík pri dverách */}
      <IsoBox gx={gx + w / 2 - 0.42} gy={gy + d} w={0.84} d={0.3} h={5} z={0} color="#b0b8c6" top="#c7cedb" />

      {/* strecha */}
      <polygon points={backSlope} fill={roofDark} />
      <polygon points={gable} fill={darken(wall, 0.2)} />
      <polygon points={P([iso(gx + w, gy + d, H), iso(gx + w, mid, H + RH), iso(gx + w + o, mid, H + RH), iso(gx + w + o, gy + d + o, H)])} fill={darken(roof, 0.12)} />
      <polygon points={slopeFront} fill={roofA} />
      <polygon points={slopeFront} fill="url(#ag-roof-sheen)" opacity={0.55} />
      {tiles}
      <polygon points={fascia} fill={roofDark} />
      {/* hrebeň */}
      <polyline points={P([iso(gx - o, mid, H + RH), iso(gx + w + o, mid, H + RH)])} stroke={lighten(roof, 0.35)} strokeWidth={4} strokeLinecap="round" fill="none" />
      {/* okrúhle okno v štíte */}
      <g transform={`translate(${iso(gx + w, gy + d * 0.5, H + 20)[0]} ${iso(gx + w, gy + d * 0.5, H + 20)[1]}) matrix(1 -0.5 0 1 0 0)`}>
        <circle r={13} fill="#fff8ea" stroke="#c9a273" strokeWidth={1.6} />
        <circle r={10} fill="url(#ag-glass)" />
        <line x1={-10} x2={10} y1={0} y2={0} stroke="#fff8ea" strokeWidth={1.6} />
        <line y1={-10} y2={10} x1={0} x2={0} stroke="#fff8ea" strokeWidth={1.6} />
      </g>

      {/* komín */}
      <IsoBox gx={chGx} gy={chGy} w={0.32} d={0.32} h={66} z={chZ} color="#b6553a" top="#d0704f" stroke="#7a3422" />
      <rect x={chTop[0] - 12} y={chTop[1] - 3} width={24} height={7} rx={2} fill="#7a3422" />
      <g transform={`translate(${chTop[0]} ${chTop[1] - 6})`}>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} r={6 + i * 1.5} fill="#e8edf5" className={`ag-smoke ${status === "working" ? "ag-smoke-strong" : ""}`} style={{ animationDelay: `${i * 1.4}s` }} />
        ))}
      </g>
    </g>
  );
});

/** Svetlá okien (kreslí sa nad zatmavením v noci). */
export const HouseLights = memo(function HouseLights({ g, on }: { g: HouseGeom; on: boolean }) {
  const wins = houseWindows(g);
  return (
    <g style={{ opacity: on ? 1 : 0, transition: "opacity 1.4s ease" }}>
      {wins.map((win, i) => (
        <g key={i} transform={faceMatrix(g, win.face)}>
          <g transform={`translate(${win.u} ${-win.v - win.h})`}>
            <rect width={win.w} height={win.h} rx={2} fill="#ffd27a" opacity={0.95} />
            <rect x={win.w / 2 - 1} width={2} height={win.h} fill="#fff1c9" />
            <rect y={win.h / 2 - 1} width={win.w} height={2} fill="#fff1c9" />
            <rect x={-10} y={-10} width={win.w + 20} height={win.h + 20} fill="url(#ag-window-glow)" />
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
  return (
    <g className="ag-plot" style={{ cursor: "pointer" }}>
      {/* zem parcely */}
      <polygon points={P(corners)} fill={color} opacity={on ? 0.24 : 0.12} style={{ transition: "opacity .25s" }} />
      <polygon points={P(corners)} fill="none" stroke={color} strokeWidth={2.2} strokeDasharray="9 7" opacity={on ? 1 : 0.7} className="ag-dash" />
      {/* mriežka výkresu */}
      {Array.from({ length: Math.floor(w) }).map((_, i) => {
        const a = iso(gx + i + 1, gy);
        const b = iso(gx + i + 1, gy + d);
        return <line key={"x" + i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.8} opacity={0.22} />;
      })}
      {Array.from({ length: Math.floor(d) }).map((_, i) => {
        const a = iso(gx, gy + i + 1);
        const b = iso(gx + w, gy + i + 1);
        return <line key={"y" + i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.8} opacity={0.22} />;
      })}
      {/* kolíky s vlajočkami */}
      {corners.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <line x1={0} y1={0} x2={0} y2={-26} stroke="#8a5a3b" strokeWidth={2.4} />
          <polygon points="0,-26 13,-22 0,-17" fill={color} className="ag-flutter" style={{ animationDelay: `${i * 0.35}s` }} />
        </g>
      ))}
      {/* duch budúcej budovy */}
      <g style={{ opacity: on ? 0.6 : 0.26, transition: "opacity .3s" }}>
        <IsoBox gx={ghostGx} gy={ghostGy} w={gw} d={gd} h={bh} color={mix(color, "#ffffff", 0.35)} stroke={color} />
        <polygon
          points={P([iso(ghostGx - 0.15, ghostGy + gd + 0.15, bh), iso(ghostGx + gw + 0.15, ghostGy + gd + 0.15, bh), iso(ghostGx + gw + 0.15, ghostGy + gd / 2, bh + 34), iso(ghostGx - 0.15, ghostGy + gd / 2, bh + 34)])}
          fill={color}
          opacity={0.7}
        />
      </g>
      {/* plus */}
      <g transform={`translate(${c[0]} ${c[1] - bh - 46})`}>
        <g className="ag-bob">
          <circle r={15} fill={color} opacity={on ? 0.95 : 0.7} />
          <circle r={15} fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.7} />
          <path d="M-6,0 H6 M0,-6 V6" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
});
