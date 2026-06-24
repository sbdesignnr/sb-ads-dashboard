"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Wallet, Building2, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REGIONS, type RegionInfo } from "@/lib/competitors/constants";
import { SK_REGION_GEO, SK_VIEWBOX } from "@/lib/competitors/sk-regions-geo";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

// Color by recommended-price ceiling (proxy for purchasing power).
function tier(region: RegionInfo): { color: string; label: string } {
  if (region.priceMax >= 4000) return { color: "#10B981", label: "Vysoká" };
  if (region.priceMax >= 3000) return { color: "#3B82F6", label: "Stredná" };
  return { color: "#F59E0B", label: "Nižšia" };
}

interface Shape {
  code: string;
  d: string;
  labelX: number;
  labelY: number;
  info: RegionInfo;
}

const SHAPES: Shape[] = SK_REGION_GEO.map((g) => {
  const info = REGIONS.find((r) => r.name === g.nutsName);
  return info ? { code: g.code, d: g.d, labelX: g.labelX, labelY: g.labelY, info } : null;
}).filter((s): s is Shape => s !== null);

export function RegionalMap() {
  const [selectedKey, setSelectedKey] = useState("NR");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => REGIONS.find((r) => r.key === selectedKey) ?? REGIONS[0],
    [selectedKey],
  );
  const hovered = hoverKey ? REGIONS.find((r) => r.key === hoverKey) ?? null : null;
  const selTier = tier(selected);

  const select = (key: string) => {
    setSelectedKey(key);
    requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width });
  };

  return (
    <div className="space-y-6">
      {/* Map */}
      <div
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHoverKey(null);
          setTip(null);
        }}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-gradient-to-b from-surface-2/30 to-surface"
      >
        <svg
          viewBox={`0 0 ${SK_VIEWBOX.width} ${SK_VIEWBOX.height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Mapa krajov Slovenska podľa kúpnej sily"
        >
          {SHAPES.map((s) => {
            const t = tier(s.info);
            const active = s.info.key === selectedKey;
            const hov = s.info.key === hoverKey;
            return (
              <path
                key={s.code}
                d={s.d}
                onMouseEnter={() => setHoverKey(s.info.key)}
                onClick={() => select(s.info.key)}
                className="cursor-pointer transition-all duration-150"
                style={{
                  fill: t.color,
                  fillOpacity: active ? 0.95 : hov ? 0.82 : 0.55,
                  stroke: active ? "#F1F5F9" : "#0B1220",
                  strokeWidth: active ? 2 : 1,
                  strokeLinejoin: "round",
                }}
              />
            );
          })}
          {SHAPES.map((s) => (
            <text
              key={`label-${s.code}`}
              x={s.labelX}
              y={s.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                fill: "#ffffff",
                paintOrder: "stroke",
                stroke: "#0B1220",
                strokeWidth: 3.5,
                strokeLinejoin: "round",
                pointerEvents: "none",
              }}
            >
              {s.info.name.replace(" kraj", "")}
            </text>
          ))}
        </svg>

        {/* Tooltip */}
        {hovered && tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 shadow-xl shadow-black/40"
            style={{
              left: Math.min(Math.max(tip.x, 92), tip.w - 92),
              top: Math.max(tip.y - 12, 10),
            }}
          >
            <p className="whitespace-nowrap text-sm font-semibold text-foreground">{hovered.name}</p>
            <p className="whitespace-nowrap text-xs text-muted">
              Mzda {formatCurrency(hovered.avgSalary, true)} · Cena {formatNumber(hovered.priceMin)}–
              {formatNumber(hovered.priceMax)} €
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-1 rounded-lg border border-border bg-surface/85 px-2.5 py-2 text-[11px] backdrop-blur">
          <span className="mb-0.5 font-medium text-foreground">Kúpna sila</span>
          {[
            { c: "#10B981", l: "Vysoká (Bratislavský)" },
            { c: "#3B82F6", l: "Stredná" },
            { c: "#F59E0B", l: "Nižšia" },
          ].map((x) => (
            <span key={x.l} className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: x.c }} />
              {x.l}
            </span>
          ))}
        </div>
      </div>

      {/* Detail + table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div ref={detailRef} className="scroll-mt-24 lg:col-span-2">
          <motion.div
            key={selected.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">{selected.name}</p>
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${selTier.color}1f`, color: selTier.color }}
              >
                {selTier.label} kúpna sila
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Stat icon={Wallet} label="Priem. mzda" value={formatCurrency(selected.avgSalary, true)} />
              <Stat
                icon={TrendingUp}
                label="Odpor. cena webu"
                value={`${formatNumber(selected.priceMin)}–${formatNumber(selected.priceMax)} €`}
              />
              <Stat icon={Building2} label="Hustota firiem" value={`${selected.businessDensity}/1k`} />
            </div>
            <p className="mt-3 text-xs text-muted">
              HDP na obyvateľa ~{formatCurrency(selected.gdpPerCapita, true)} ročne. Ceny prispôsob
              lokálnej kúpnej sile — v {selected.name.replace(" kraj", "skom kraji")} sa pohybuj v
              rozmedzí {formatNumber(selected.priceMin)}–{formatNumber(selected.priceMax)} €.
            </p>
          </motion.div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-xl border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Kraj</TableHead>
                  <TableHead className="text-right">Mzda</TableHead>
                  <TableHead className="text-right">Odpor. cena</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {REGIONS.map((r) => {
                  const t = tier(r);
                  return (
                    <TableRow
                      key={r.key}
                      onClick={() => select(r.key)}
                      onMouseEnter={() => setHoverKey(r.key)}
                      onMouseLeave={() => setHoverKey(null)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-surface-2/50",
                        r.key === selectedKey && "bg-surface-2/60",
                      )}
                    >
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="text-sm text-foreground">{r.name.replace(" kraj", "")}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {formatCurrency(r.avgSalary, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {formatNumber(r.priceMin)}–{formatNumber(r.priceMax)} €
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-surface-2/40 p-2.5">
      <Icon className="mx-auto h-4 w-4 text-muted" />
      <p className="mt-1 text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
