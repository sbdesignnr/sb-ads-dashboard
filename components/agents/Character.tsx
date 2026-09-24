"use client";

// Postavička agenta (SVG). Počiatok súradníc = chodidlá; výška ≈ 92 px.
// Póza určuje animáciu (pozri agents.css): stand, walk, type, wave, sit, sleep.

import { memo } from "react";
import type { Look } from "@/lib/agents/registry";
import { darken, lighten } from "./iso";

export type Pose = "stand" | "walk" | "type" | "wave" | "sit" | "sleep";

function Hair({ look, back }: { look: Look; back: boolean }) {
  const h = look.hair;
  if (back) {
    if (look.hairStyle === "bun")
      return (
        <g>
          <circle cx={0} cy={-90} r={9.5} fill={darken(h, 0.1)} />
          <circle cx={-2.5} cy={-92} r={4} fill={lighten(h, 0.2)} opacity={0.5} />
        </g>
      );
    if (look.hairStyle === "long")
      return <path d="M-16,-70 Q-19,-40 -10,-38 L10,-38 Q19,-40 16,-70 Z" fill={darken(h, 0.1)} />;
    return null;
  }
  return (
    <g>
      <path d="M-16,-68 Q-18,-90 0,-90 Q18,-90 16,-68 Q12,-79 3,-79.5 Q-6,-80 -10,-74 Q-13,-72 -16,-68 Z" fill={h} />
      <path d="M-13,-84 Q-6,-90 3,-88" stroke={lighten(h, 0.3)} strokeWidth={2} fill="none" opacity={0.55} strokeLinecap="round" />
      {look.hairStyle === "cap" && (
        <g>
          <path d="M-17,-76 Q-16,-93 0,-93 Q16,-93 17,-76 Z" fill={look.accent} />
          <path d="M-17,-76 L-28,-73 Q-24,-70 -14,-72 Z" fill={darken(look.accent, 0.2)} />
        </g>
      )}
    </g>
  );
}

export const Character = memo(function Character({
  look,
  pose,
  dir = 1,
  hop = 0,
}: {
  look: Look;
  pose: Pose;
  /** 1 = pozerá doprava, -1 = doľava */
  dir?: 1 | -1;
  /** zmena hodnoty spustí poskok (reakcia na myš) */
  hop?: number;
}) {
  const seated = pose === "type" || pose === "sit" || pose === "sleep";
  const f = dir * 1.6; // posun črty tváre = pohľad do strany
  const sleeping = pose === "sleep";
  const skinShade = darken(look.skin, 0.1);

  return (
    <g className={`ag-ch ag-pose-${pose}`}>
      <ellipse cx={0} cy={1.5} rx={seated ? 20 : 16} ry={5.4} fill="#0b1220" opacity={0.22} />
      <g key={hop} className={hop ? "ag-hop" : undefined}>
        <g transform={`scale(${dir} 1)`}>
          <g className="ag-body" transform={seated ? "translate(0 12)" : undefined}>
            {/* nohy */}
            {!seated && (
              <g>
                <g className="ag-leg ag-leg-l">
                  <rect x={-8.5} y={-28} width={7.5} height={26} rx={3.4} fill={look.pants} />
                  <ellipse cx={-5} cy={-1.8} rx={6.6} ry={3.5} fill="#1a2233" />
                </g>
                <g className="ag-leg ag-leg-r">
                  <rect x={1} y={-28} width={7.5} height={26} rx={3.4} fill={darken(look.pants, 0.12)} />
                  <ellipse cx={5} cy={-1.8} rx={6.6} ry={3.5} fill="#1a2233" />
                </g>
              </g>
            )}
            {seated && (
              <g>
                <rect x={-9} y={-30} width={8} height={18} rx={3.5} fill={look.pants} />
                <rect x={1} y={-30} width={8} height={18} rx={3.5} fill={darken(look.pants, 0.12)} />
              </g>
            )}

            {/* trup */}
            <g className="ag-torso">
              <rect x={-13.5} y={-54} width={27} height={31} rx={10} fill={look.outfit} />
              <path d="M2,-54 h1.5 a10,10 0 0 1 10,10 v11 a10,10 0 0 1 -10,10 h-1.5 z" fill={look.outfitDark} opacity={0.6} />
              {/* golier */}
              <path d="M-7,-54 L0,-45 L7,-54 Z" fill={lighten(look.outfit, 0.55)} />
              {/* šnúrka s visačkou */}
              <path d="M-4,-53 L0,-38 L4,-53" stroke={look.accent} strokeWidth={1.6} fill="none" />
              <rect x={-4.5} y={-38} width={9} height={11} rx={2} fill="#fff" stroke={look.accent} strokeWidth={1.4} />
              <rect x={-2.5} y={-35.5} width={5} height={1.6} fill={look.accent} />
              <rect x={-2.5} y={-32} width={5} height={1.4} fill="#cbd5e1" />
            </g>

            {/* ruky */}
            <g className="ag-arm ag-arm-l">
              <rect x={-19} y={-52} width={8} height={26} rx={4} fill={look.outfit} />
              <circle cx={-15} cy={-25} r={4.3} fill={look.skin} />
              {pose === "wave" && (
                <g transform="translate(-15 -30) rotate(-12)">
                  <rect x={-8} y={-20} width={16} height={21} rx={2} fill="#fff" stroke="#cbd5e1" strokeWidth={1} />
                  <line x1={-5} y1={-15} x2={5} y2={-15} stroke="#94a3b8" strokeWidth={1.2} />
                  <line x1={-5} y1={-10} x2={5} y2={-10} stroke="#94a3b8" strokeWidth={1.2} />
                  <line x1={-5} y1={-5} x2={2} y2={-5} stroke="#94a3b8" strokeWidth={1.2} />
                </g>
              )}
            </g>
            <g className="ag-arm ag-arm-r">
              <rect x={11} y={-52} width={8} height={26} rx={4} fill={look.outfitDark} />
              <circle cx={15} cy={-25} r={4.3} fill={look.skin} />
              {pose === "sit" && (
                <g transform="translate(15 -26)">
                  <rect x={-5} y={-10} width={10} height={11} rx={2} fill="#f8fafc" />
                  <ellipse cx={0} cy={-10} rx={5} ry={2} fill="#7a4b2a" />
                  <path d="M5,-7 q5,0 0,5" stroke="#f8fafc" strokeWidth={1.8} fill="none" />
                </g>
              )}
            </g>

            {/* krk + hlava */}
            <rect x={-3.5} y={-58} width={7} height={7} fill={skinShade} />
            <g className="ag-head">
              <Hair look={look} back />
              <circle cx={-15.4} cy={-67} r={3.4} fill={skinShade} />
              <circle cx={15.4} cy={-67} r={3.4} fill={skinShade} />
              <circle cx={0} cy={-68} r={16} fill={look.skin} />
              <circle cx={0} cy={-68} r={16} fill="url(#ag-face-shade)" opacity={0.5} />
              <Hair look={look} back={false} />
              {look.headset && (
                <g>
                  <path d="M-17,-68 Q-17,-91 0,-91 Q17,-91 17,-68" stroke="#1f2937" strokeWidth={3} fill="none" />
                  <rect x={-20} y={-72} width={6} height={11} rx={3} fill="#1f2937" />
                  <rect x={14} y={-72} width={6} height={11} rx={3} fill="#1f2937" />
                  <path d="M-16,-62 Q-14,-54 -6,-54" stroke="#1f2937" strokeWidth={2} fill="none" />
                  <circle cx={-6} cy={-54} r={2.4} fill={look.accent} />
                </g>
              )}
              {/* tvár */}
              <g transform={`translate(${f} 0)`}>
                <circle cx={-10.5} cy={-62} r={3.2} fill="#ff8fa3" opacity={0.32} />
                <circle cx={10.5} cy={-62} r={3.2} fill="#ff8fa3" opacity={0.32} />
                {sleeping ? (
                  <g stroke="#3b2a24" strokeWidth={1.7} strokeLinecap="round" fill="none">
                    <path d="M-9.5,-67 q3,2.6 6,0" />
                    <path d="M3.5,-67 q3,2.6 6,0" />
                  </g>
                ) : (
                  <g className="ag-eyes">
                    <ellipse cx={-6.5} cy={-67} rx={2.2} ry={2.9} fill="#2a1f1c" />
                    <ellipse cx={6.5} cy={-67} rx={2.2} ry={2.9} fill="#2a1f1c" />
                    <circle cx={-5.8} cy={-68} r={0.9} fill="#fff" />
                    <circle cx={7.2} cy={-68} r={0.9} fill="#fff" />
                  </g>
                )}
                {look.glasses && (
                  <g fill="#ffffff" fillOpacity={0.12} stroke="#2b2f3a" strokeWidth={1.4}>
                    <circle cx={-6.5} cy={-67} r={6} />
                    <circle cx={6.5} cy={-67} r={6} />
                    <path d="M-0.5,-67 h1" fill="none" />
                  </g>
                )}
                <path d="M-6.5,-73 q2,-1.4 4,0 M2.5,-73 q2,-1.4 4,0" stroke={look.hair} strokeWidth={1.3} fill="none" strokeLinecap="round" />
                <path
                  d={pose === "walk" || pose === "sit" ? "M-3.4,-59.5 Q0,-56.6 3.4,-59.5" : sleeping ? "M-2,-59 h4" : "M-3,-59.6 Q0,-57.4 3,-59.6"}
                  stroke="#8a3f3a"
                  strokeWidth={1.5}
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
});
