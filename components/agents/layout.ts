// Rozloženie jedného agentského "sídla" na parcele: dom, stôl, schránka a trasy postavičky.

import type { PlotDef } from "@/lib/agents/registry";
import { HOUSE_H, HOUSE_RH, type HouseGeom } from "./Building";

export type NodeName = "seat" | "aisle" | "yard" | "table" | "road1" | "road2" | "plaza";

export interface HomeLayout {
  house: HouseGeom;
  front: number;
  desk: { gx: number; gy: number };
  chair: { gx: number; gy: number };
  table: { gx: number; gy: number };
  mailbox: { gx: number; gy: number };
  nodes: Record<NodeName, [number, number]>;
  parent: Partial<Record<NodeName, NodeName>>;
}

export function homeLayout(plot: PlotDef, access: "avenue" | "corridor" = "avenue"): HomeLayout {
  const house: HouseGeom = { gx: plot.gx + 0.5, gy: plot.gy + 0.3, w: 3.0, d: 2.4, H: HOUSE_H, RH: HOUSE_RH };
  const front = house.gy + house.d;
  const doorX = house.gx + house.w / 2;
  const base = {
    house,
    front,
    desk: { gx: house.gx, gy: front + 0.55 },
    chair: { gx: house.gx + 0.25, gy: front - 0.02 },
    table: { gx: doorX + 0.8, gy: front + 0.5 },
    mailbox: { gx: plot.gx + plot.w - 0.15, gy: front + 0.3 },
  };
  const near = {
    seat: [house.gx + 0.5, front + 0.4] as [number, number],
    aisle: [house.gx + 1.05, front + 0.4] as [number, number],
    yard: [doorX - 0.35, front + 0.95] as [number, number],
    table: [doorX + 0.5, front + 0.95] as [number, number],
  };
  if (access === "corridor") {
    // dom pri vodorovnej ceste: od dverí ide chodník k ceste a po nej k námestiu
    const road: [number, number] = [doorX, 7.0];
    return {
      ...base,
      nodes: { ...near, road1: road, road2: road, plaza: [8.9, 7.0] },
      parent: { seat: "aisle", aisle: "yard", table: "yard", yard: "road1", road1: "plaza" },
    };
  }
  const roadY = front + 1.75;
  return {
    ...base,
    nodes: { ...near, road1: [doorX, roadY], road2: [7.0, roadY], plaza: [7.0, 9.1] },
    parent: { seat: "aisle", aisle: "yard", table: "yard", yard: "road1", road1: "road2", road2: "plaza" },
  };
}

/** Trasa medzi dvoma uzlami po stromovom grafe (cez najbližšieho spoločného predka). */
export function routeNames(l: HomeLayout, from: NodeName, to: NodeName): NodeName[] {
  const chain = (n: NodeName) => {
    const out: NodeName[] = [n];
    let cur: NodeName | undefined = n;
    while (cur && l.parent[cur]) {
      cur = l.parent[cur];
      if (cur) out.push(cur);
    }
    return out;
  };
  const a = chain(from);
  const b = chain(to);
  const common = a.find((x) => b.includes(x)) as NodeName;
  const up = a.slice(0, a.indexOf(common) + 1);
  const down = b.slice(0, b.indexOf(common)).reverse();
  return [...up, ...down];
}
