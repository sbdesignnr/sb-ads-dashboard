"use client";

// Operatívec agenta (SVG): štíhla postava v taktickom obleku s farebným akcentom. Počiatok súradníc =
// chodidlá; výška ≈ 88 px. Póza určuje animáciu (pozri agents.css): stand, walk, type, wave, sit, sleep.

import { memo } from "react";
import type { Look } from "@/lib/agents/registry";
import { darken, lighten, mix } from "./iso";

export type Pose = "stand" | "walk" | "type" | "wave" | "sit" | "sleep";

function Hair({ look, back }: { look: Look; back: boolean }) {
  const h = darken(look.hair, 0.12);
  if (back) {
    if (look.hairStyle === "bun")
      return (
        <g>
          <circle cx={-1} cy={-85} r={5.4} fill={h} />
          <circle cx={-2.6} cy={-86.6} r={2} fill={lighten(h, 0.25)} opacity={0.5} />
        </g>
      );
    if (look.hairStyle === "long")
      return <path d="M-9,-75 Q-19,-58 -11,-42 Q-6,-49 -8.4,-62 Z" fill={h} />;
    return null;
  }
  return (
    <g>
      <path d="M-11.6,-70 Q-12.4,-83.6 0,-83.6 Q12.4,-83.6 11.6,-70 Q8.6,-77.4 0,-77 Q-8,-77 -11.6,-70 Z" fill={h} />
      <path d="M-8,-80.5 Q-2,-84 5,-82.4" stroke={lighten(h, 0.35)} strokeWidth={1.4} fill="none" opacity={0.55} strokeLinecap="round" />
      {look.hairStyle === "cap" && (
        <g>
          <path d="M-12.2,-75 Q-11.6,-87 0,-87 Q11.6,-87 12.2,-75 Z" fill="#0f172a" />
          <rect x={-12.2} y={-76.4} width={24.4} height={2.2} fill={look.accent} />
          <path d="M-12.2,-75 L-20,-72.6 Q-17,-70 -10.6,-72 Z" fill="#0b1226" />
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
  const f = dir * 1.4; // posun črty tváre = pohľad do strany
  const sleeping = pose === "sleep";
  const skinShade = darken(look.skin, 0.12);
  const suit = mix(look.outfit, "#0e1630", 0.6);
  const suitDark = mix(look.outfitDark, "#070c1c", 0.7);
  const pants = mix(look.pants, "#0b1226", 0.55);
  const boots = "#070b18";
  const acc = look.accent;

  return (
    <g className={`ag-ch ag-pose-${pose}`}>
      <ellipse cx={0} cy={1.5} rx={seated ? 20 : 15} ry={5.2} fill="#02050d" opacity={0.5} />
      <ellipse cx={0} cy={1.5} rx={seated ? 15 : 11} ry={3.6} fill="none" stroke={acc} strokeWidth={1} opacity={0.55} />
      <g key={hop} className={hop ? "ag-hop" : undefined}>
        <g transform={`scale(${dir} 1)`}>
          <g className="ag-body" transform={seated ? "translate(0 12)" : undefined}>
            {/* nohy */}
            {!seated && (
              <g>
                <g className="ag-leg ag-leg-l">
                  <rect x={-8} y={-31} width={7} height={29} rx={3} fill={pants} />
                  <rect x={-8} y={-31} width={1.6} height={29} fill={acc} opacity={0.8} />
                  <path d="M-9,-4 h9.4 a2,2 0 0 1 2,2 v2 h-11.4 z" fill={boots} />
                </g>
                <g className="ag-leg ag-leg-r">
                  <rect x={1} y={-31} width={7} height={29} rx={3} fill={darken(pants, 0.18)} />
                  <path d="M0,-4 h9.4 a2,2 0 0 1 2,2 v2 h-11.4 z" fill={boots} />
                </g>
              </g>
            )}
            {seated && (
              <g>
                <rect x={-8.6} y={-31} width={7.4} height={19} rx={3.2} fill={pants} />
                <rect x={1.2} y={-31} width={7.4} height={19} rx={3.2} fill={darken(pants, 0.18)} />
              </g>
            )}

            {/* trup */}
            <g className="ag-torso">
              <path d="M-12.6,-52 Q-12.6,-58 -6,-58 H6 Q12.6,-58 12.6,-52 V-31 Q12.6,-27 8,-27 H-8 Q-12.6,-27 -12.6,-31 Z" fill={suit} />
              <path d="M3,-58 H6 Q12.6,-58 12.6,-52 V-31 Q12.6,-27 8,-27 H3 Z" fill={suitDark} opacity={0.7} />
              {/* golier a zips */}
              <path d="M-6,-58 L0,-51 L6,-58 Z" fill={lighten(suit, 0.14)} />
              <line x1={0} y1={-51} x2={0} y2={-28} stroke={darken(suit, 0.3)} strokeWidth={1} />
              {/* akcentový pás a symbol na hrudi */}
              <rect x={-12.6} y={-30} width={25.2} height={2.6} fill={acc} opacity={0.9} />
              <polygon points="-7.4,-47 -5,-50.4 -1.2,-50.4 1.2,-47 -1.2,-43.6 -5,-43.6" fill="#050914" stroke={acc} strokeWidth={1} />
              <circle cx={-3.1} cy={-47} r={1.3} fill={acc} />
              {/* ramenné pásy */}
              <rect x={-12.6} y={-56.6} width={3.2} height={9} rx={1.4} fill={acc} opacity={0.85} />
              <rect x={9.4} y={-56.6} width={3.2} height={9} rx={1.4} fill={acc} opacity={0.6} />
            </g>

            {/* ruky */}
            <g className="ag-arm ag-arm-l">
              <rect x={-18.6} y={-55} width={7} height={27} rx={3.4} fill={suit} />
              <rect x={-18.6} y={-32} width={7} height={2.2} fill={acc} opacity={0.9} />
              <circle cx={-15.1} cy={-26} r={3.5} fill="#131c38" />
              {pose === "wave" && (
                <g transform="translate(-15 -30) rotate(-12)">
                  <rect x={-9} y={-22} width={18} height={23} rx={2} fill="#06101f" fillOpacity={0.94} stroke="#67e8f9" strokeWidth={1.2} />
                  <line x1={-5} y1={-16} x2={5} y2={-16} stroke="#67e8f9" strokeWidth={1.2} />
                  <line x1={-5} y1={-11} x2={5} y2={-11} stroke="#67e8f9" strokeWidth={1.2} opacity={0.7} />
                  <line x1={-5} y1={-6} x2={2} y2={-6} stroke="#67e8f9" strokeWidth={1.2} opacity={0.5} />
                </g>
              )}
            </g>
            <g className="ag-arm ag-arm-r">
              <rect x={11.6} y={-55} width={7} height={27} rx={3.4} fill={suitDark} />
              <rect x={11.6} y={-32} width={7} height={2.2} fill={acc} opacity={0.6} />
              <circle cx={15.1} cy={-26} r={3.5} fill="#0f1730" />
              {pose === "sit" && (
                <g transform="translate(15 -26)">
                  <rect x={-4.6} y={-10} width={9.2} height={11} rx={2} fill="#0d1630" stroke={acc} strokeWidth={1} />
                  <ellipse cx={0} cy={-10} rx={4.6} ry={1.8} fill="#0a2038" />
                  <path d="M4.6,-7 q4.6,0 0,4.6" stroke={acc} strokeWidth={1.4} fill="none" />
                </g>
              )}
            </g>

            {/* krk + hlava */}
            <rect x={-3} y={-61} width={6} height={7} fill={skinShade} />
            <g className="ag-head">
              <Hair look={look} back />
              <circle cx={-11.2} cy={-69.5} r={2.4} fill={skinShade} />
              <circle cx={11.2} cy={-69.5} r={2.4} fill={skinShade} />
              <ellipse cx={0} cy={-70} rx={11} ry={12} fill={look.skin} />
              <ellipse cx={4.6} cy={-68} rx={6.4} ry={11} fill={skinShade} opacity={0.22} />
              <Hair look={look} back={false} />
              {look.headset && (
                <g>
                  <path d="M-11.6,-71 Q-11.6,-86 0,-86 Q11.6,-86 11.6,-71" stroke="#0b1226" strokeWidth={2.4} fill="none" />
                  <rect x={-14} y={-74} width={4.6} height={8.4} rx={2.2} fill="#0b1226" stroke={acc} strokeWidth={0.8} />
                  <rect x={9.4} y={-74} width={4.6} height={8.4} rx={2.2} fill="#0b1226" stroke={acc} strokeWidth={0.8} />
                  <path d="M-11.4,-66 Q-10.4,-59.5 -4.6,-59.5" stroke="#0b1226" strokeWidth={1.6} fill="none" />
                  <circle cx={-4.6} cy={-59.5} r={1.8} fill={acc} />
                </g>
              )}
              {/* tvár */}
              <g transform={`translate(${f} 0)`}>
                {sleeping ? (
                  <g stroke="#2a1f1c" strokeWidth={1.4} strokeLinecap="round" fill="none">
                    <path d="M-6.6,-70.6 q2.2,1.8 4.4,0" />
                    <path d="M2.2,-70.6 q2.2,1.8 4.4,0" />
                  </g>
                ) : (
                  <g className="ag-eyes">
                    <ellipse cx={-4.4} cy={-70.6} rx={1.5} ry={2} fill="#1a1512" />
                    <ellipse cx={4.4} cy={-70.6} rx={1.5} ry={2} fill="#1a1512" />
                    <circle cx={-3.9} cy={-71.4} r={0.6} fill="#fff" />
                    <circle cx={4.9} cy={-71.4} r={0.6} fill="#fff" />
                  </g>
                )}
                {look.glasses && (
                  <g fill="#7ce9ff" fillOpacity={0.16} stroke="#0b1226" strokeWidth={1.2}>
                    <rect x={-8.6} y={-73.8} width={7.4} height={5.8} rx={1.6} />
                    <rect x={1.2} y={-73.8} width={7.4} height={5.8} rx={1.6} />
                    <path d="M-1.2,-71.5 h2.4" fill="none" />
                  </g>
                )}
                <path d="M-6.4,-75.4 q2.2,-1 4.4,0 M2,-75.4 q2.2,-1 4.4,0" stroke={darken(look.hair, 0.2)} strokeWidth={1.1} fill="none" strokeLinecap="round" />
                <path
                  d={pose === "walk" || pose === "sit" ? "M-2.8,-64.2 Q0,-62.2 2.8,-64.2" : sleeping ? "M-1.8,-64 h3.6" : "M-2.6,-64.2 Q0,-63 2.6,-64.2"}
                  stroke="#7a3f39"
                  strokeWidth={1.3}
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
