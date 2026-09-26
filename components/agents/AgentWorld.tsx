"use client";

// Operačné centrum agentov: plávajúca paluba s modulmi a operatívcami, ktorí ukazujú REÁLNY stav
// agentov (pracuje / čaká na schválenie / nečinný). Kamera sa dá ťahať a približovať,
// deň a noc sa riadia časom. Kliknutím na agenta sa otvorí jeho panel.

import "./agents.css";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Moon, Sun, Sunset, ZoomIn, ZoomOut } from "lucide-react";
import {
  AGENTS,
  DEPARTMENTS,
  PLOTS,
  STATUS_COLOR,
  statusLabel,
  agentById,
  departmentById,
  plotById,
  type AgentDef,
  type AgentStatus,
} from "@/lib/agents/registry";
import { cn } from "@/lib/utils";
import { Birds, Clouds, Ground, Island, WorldDefs } from "./WorldBase";
import {
  ApprovalTable,
  Bench,
  Bush,
  Chair,
  Fence,
  Flowers,
  HoloCore,
  HoloChips,
  Lamp,
  Mailbox,
  Rock,
  Signpost,
  Tree,
  Workstation,
  type TreeKind,
} from "./Props";
import { EmptyPlot, House, HouseLights } from "./Building";
import { Character, type Pose } from "./Character";
import { homeLayout, routeNames, type HomeLayout, type NodeName } from "./layout";
import { depthSort, footprint, iso, type Bounds } from "./iso";
import { AgentPanel, PlotPanel } from "./AgentPanel";
import { Workbench } from "./Workbench";
import { BudgetChip } from "./BudgetChip";
import { GuideChip } from "./GuideChip";
import { useAgentStatus } from "./useAgentStatus";

// ── čas dňa ────────────────────────────────────────────────────────────────

type Phase = "dawn" | "day" | "dusk" | "night";
type PhaseMode = "auto" | Phase;

const phaseFromHour = (h: number): Phase => (h >= 6 && h < 8 ? "dawn" : h >= 8 && h < 18 ? "day" : h >= 18 && h < 20 ? "dusk" : "night");

// Operačné centrum svieti stále (neónové pásy, displeje); čas dňa mení len oblohu a jemné zafarbenie scény.
const PHASE: Record<Phase, { tint: string; lights: boolean; stars: number }> = {
  day: { tint: "#ffffff", lights: true, stars: 0.4 },
  dawn: { tint: "#f0e6ff", lights: true, stars: 0.55 },
  dusk: { tint: "#f6dbe9", lights: true, stars: 0.65 },
  night: { tint: "#a8b8ea", lights: true, stars: 1 },
};

const SKY: Record<Phase, string> = {
  day: "radial-gradient(ellipse 90% 60% at 50% 105%,rgba(56,189,248,.24) 0%,rgba(56,189,248,0) 70%),linear-gradient(180deg,#040a1c 0%,#0a1f47 55%,#0e3560 100%)",
  dawn: "radial-gradient(ellipse 90% 60% at 50% 105%,rgba(244,114,182,.18) 0%,rgba(244,114,182,0) 70%),linear-gradient(180deg,#050a1e 0%,#171f52 55%,#41356e 100%)",
  dusk: "radial-gradient(ellipse 90% 60% at 50% 105%,rgba(251,146,60,.17) 0%,rgba(251,146,60,0) 70%),linear-gradient(180deg,#040820 0%,#161d54 52%,#3a2b5c 100%)",
  night: "radial-gradient(ellipse 90% 60% at 50% 105%,rgba(56,189,248,.12) 0%,rgba(56,189,248,0) 70%),linear-gradient(180deg,#02040c 0%,#060d24 52%,#0c1838 100%)",
};

// ── scéna ──────────────────────────────────────────────────────────────────

const pointBox = (gx: number, gy: number, r = 0.18): Bounds => ({ x0: gx - r, x1: gx + r, y0: gy - r, y1: gy + r });

interface TreeSpec {
  gx: number;
  gy: number;
  kind: TreeKind;
  s: number;
}
const TREES: TreeSpec[] = [
  // Predaj
  { gx: 13.5, gy: 8.4, kind: "autumn", s: 1.0 },
  { gx: 8.3, gy: 9.0, kind: "autumn", s: 0.85 },
  { gx: 8.3, gy: 13.4, kind: "round", s: 0.8 },
  // Marketing
  { gx: 13.5, gy: 0.9, kind: "blossom", s: 1.05 },
  { gx: 13.55, gy: 3.1, kind: "blossom", s: 0.95 },
  { gx: 8.5, gy: 0.5, kind: "blossom", s: 0.9 },
  { gx: 13.3, gy: 5.7, kind: "blossom", s: 0.85 },
  { gx: 8.4, gy: 6.0, kind: "blossom", s: 0.75 },
  // Technika
  { gx: 0.6, gy: 8.3, kind: "pine", s: 1.0 },
  { gx: 0.7, gy: 13.3, kind: "pine", s: 1.05 },
  { gx: 5.9, gy: 9.4, kind: "pine", s: 0.8 },
  { gx: 3.5, gy: 13.5, kind: "pine", s: 0.9 },
  { gx: 3.9, gy: 8.3, kind: "pine", s: 0.75 },
  // Financie
  { gx: 0.7, gy: 0.7, kind: "round", s: 1.1 },
  { gx: 0.8, gy: 5.6, kind: "round", s: 0.95 },
  { gx: 5.8, gy: 0.8, kind: "round", s: 1.0 },
  { gx: 5.7, gy: 5.7, kind: "round", s: 0.9 },
  { gx: 0.9, gy: 3.2, kind: "round", s: 1.0 },
];

const LAMPS: [number, number][] = [
  [6.35, 2.2],
  [7.65, 4.6],
  [6.35, 10.2],
  [7.65, 12.6],
  [2.4, 6.35],
  [4.4, 7.65],
  [10.2, 6.35],
  [12.4, 7.65],
];

const BUSHES: [number, number, number][] = [
  [5.8, 6.1, 1],
  [8.2, 6.1, 1.05],
  [5.8, 7.9, 0.95],
  [8.2, 7.9, 1],
  [9.0, 13.5, 0.8],
  [12.9, 9.0, 0.7],
];
const FLOWERS: [number, number][] = [
  [5.35, 6.0],
  [8.65, 6.05],
  [5.4, 7.95],
  [8.6, 7.95],
  [10.0, 13.6],
  [12.4, 13.6],
];
const ROCKS: [number, number, number][] = [
  [0.8, 6.0, 1],
  [13.3, 7.9, 0.9],
  [2.4, 13.4, 0.8],
  [12.6, 6.0, 0.8],
];

// ── stav postavičky ────────────────────────────────────────────────────────

interface Actor {
  id: string;
  layout: HomeLayout;
  gx: number;
  gy: number;
  node: NodeName;
  route: [number, number][];
  routeNames: NodeName[];
  dest: NodeName;
  arrived: boolean;
  pose: Pose;
  dir: 1 | -1;
  strollAt: number;
  returnAt: number;
  strolling: boolean;
  g: SVGGElement | null;
  /** posledná póza/smer odoslaná do Reactu (aby sa setState nevolal každý frame) */
  shownPose: Pose;
  shownDir: 1 | -1;
}

const desiredDest = (a: Actor, status: AgentStatus): NodeName => {
  if (status === "working") return "seat";
  if (status === "waiting") return "table";
  if (status === "error") return "yard";
  return a.strolling ? "plaza" : "seat";
};

const poseAt = (dest: NodeName, status: AgentStatus, night: boolean): Pose => {
  if (dest === "seat") return status === "working" ? "type" : night ? "sleep" : "sit";
  if (dest === "table") return "wave";
  return "stand";
};

const CS = 0.84; // mierka postavičky

export function AgentWorld() {
  const { snapshots, budget, error, refresh } = useAgentStatus(5000);
  const [workbench, setWorkbench] = useState(false);
  const [pinnedLead, setPinnedLead] = useState<string | null>(null);
  // /agenti?lead=<id> otvorí pracovňu s daným leadom (odkaz z detailu leadu)
  useEffect(() => {
    const lead = new URLSearchParams(window.location.search).get("lead");
    if (lead) {
      setPinnedLead(lead);
      setWorkbench(true);
    }
  }, []);
  const [mode, setMode] = useState<PhaseMode>("auto");
  const [hour, setHour] = useState<number>(() => new Date().getHours());
  const phase: Phase = mode === "auto" ? phaseFromHour(hour) : mode;
  const P = PHASE[phase];

  const containerRef = useRef<HTMLDivElement>(null);
  const camGRef = useRef<SVGGElement>(null);
  const lightsGRef = useRef<SVGGElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 0.6 });
  const camTarget = useRef({ x: 0, y: 0, k: 0.6 });
  const view = useRef({ w: 1000, h: 600 });
  const userMoved = useRef(false);
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const fitK = useRef(0.6);

  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // "agent:nora" | "plot:marketing-a"
  const [speech, setSpeech] = useState<Record<string, { id: number; text: string }>>({});
  const speechTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSpoke = useRef<Record<string, number>>({});
  const speechId = useRef(0);
  const [hops, setHops] = useState<Record<string, number>>({});
  const [poseState, setPoseState] = useState<Record<string, { pose: Pose; dir: 1 | -1 }>>({});
  const [depthTick, setDepthTick] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const statusOf = useCallback(
    (id: string): AgentStatus => snapshots?.[id]?.status ?? "idle",
    [snapshots],
  );
  const statusRef = useRef<Record<string, AgentStatus>>({});
  const nightRef = useRef(false);
  const prevStatus = useRef<Record<string, AgentStatus>>({});

  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 12_000);
    return () => clearTimeout(t);
  }, []);
  // Esc zatvorí panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectedRef.current && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // čas dňa sa obnovuje každú minútu
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    nightRef.current = phase === "night";
  }, [phase]);

  // ── postavičky ──────────────────────────────────────────────────────────
  const actors = useRef<Record<string, Actor>>({});
  const layouts = useMemo(() => {
    const m: Record<string, HomeLayout> = {};
    for (const a of AGENTS) {
      const plot = plotById(a.plot);
      if (plot) m[a.id] = homeLayout(plot, a.access);
    }
    return m;
  }, []);

  for (const a of AGENTS) {
    if (!actors.current[a.id] && layouts[a.id]) {
      const l = layouts[a.id];
      actors.current[a.id] = {
        id: a.id,
        layout: l,
        gx: l.nodes.seat[0],
        gy: l.nodes.seat[1],
        node: "seat",
        route: [],
        routeNames: [],
        dest: "seat",
        arrived: true,
        pose: "sit",
        dir: 1,
        strollAt: performance.now() + 25_000 + Math.random() * 20_000,
        returnAt: 0,
        strolling: false,
        g: null,
        shownPose: "sit",
        shownDir: 1,
      };
    }
  }

  // ── hlášky ──────────────────────────────────────────────────────────────
  const say = useCallback((agentId: string, text: string, ms = 5600) => {
    const id = ++speechId.current;
    setSpeech((s) => ({ ...s, [agentId]: { id, text } }));
    lastSpoke.current[agentId] = Date.now();
    clearTimeout(speechTimers.current[agentId]);
    speechTimers.current[agentId] = setTimeout(() => {
      setSpeech((s) => {
        if (s[agentId]?.id !== id) return s;
        const { [agentId]: _drop, ...rest } = s;
        void _drop;
        return rest;
      });
    }, ms);
  }, []);

  const lineFor = useCallback(
    (a: AgentDef, kind: "status" | "hover") => {
      const st = statusOf(a.id);
      const counters = snapshots?.[a.id]?.counters ?? {};
      const pool = kind === "hover" && Math.random() < 0.4 ? a.lines.hover : a.lines[st];
      return pool[Math.floor(Math.random() * pool.length)](counters);
    },
    [snapshots, statusOf],
  );

  // zmena stavu → agent to okomentuje; podľa stavu sa pohne aj postavička
  useEffect(() => {
    if (!snapshots) return;
    for (const a of AGENTS) {
      const st = snapshots[a.id]?.status ?? "idle";
      statusRef.current[a.id] = st;
      const prev = prevStatus.current[a.id];
      const ac = actors.current[a.id];
      if (!prev && ac) {
        // prvé načítanie stavu: postavička sa objaví rovno na svojom mieste
        const spot: NodeName = st === "waiting" ? "table" : st === "error" ? "yard" : "seat";
        ac.gx = ac.layout.nodes[spot][0];
        ac.gy = ac.layout.nodes[spot][1];
        ac.node = spot;
        ac.dest = spot;
        ac.arrived = true;
        ac.route = [];
        ac.routeNames = [];
        ac.strollAt = performance.now() + 25_000 + Math.random() * 20_000;
      }
      if (prev && prev !== st && selected !== `agent:${a.id}`) {
        const txt: Record<AgentStatus, string> = {
          working: "Pustila som sa do práce.",
          waiting: "Hotovo! Teraz čakám na teba.",
          idle: "Máme voľno, môžem si vydýchnuť.",
          error: "Ups, niečo sa pokazilo.",
        };
        say(a.id, txt[st], 5200);
      }
      prevStatus.current[a.id] = st;
    }
  }, [snapshots, say, selected]);

  // náhodné poznámky pod čiarou (nie príliš často)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      for (const a of AGENTS) {
        if (hover === `agent:${a.id}` || selected === `agent:${a.id}`) continue;
        if (Date.now() - (lastSpoke.current[a.id] ?? 0) < 22_000) continue;
        if (Math.random() < 0.28) say(a.id, lineFor(a, "status"), 5600);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [hover, selected, say, lineFor]);

  // ── kamera ──────────────────────────────────────────────────────────────
  const FIT = { x0: -740, x1: 740, y0: -150, y1: 900 };
  const computeFit = useCallback(() => {
    const { w, h } = view.current;
    const k = Math.min(w / (FIT.x1 - FIT.x0), h / (FIT.y1 - FIT.y0));
    return {
      k,
      x: w / 2 - ((FIT.x0 + FIT.x1) / 2) * k,
      y: h / 2 - ((FIT.y0 + FIT.y1) / 2) * k,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Na úzkom (mobilnom) displeji sa začína priblížene pri domčeku prvého agenta. */
  const homeView = useCallback(() => {
    const { w, h } = view.current;
    const f = computeFit();
    const a = AGENTS[0];
    const l = a && layouts[a.id];
    if (!l) return f;
    const [sx, sy] = iso(l.house.gx + l.house.w * 0.5, l.front, 40);
    const k = Math.max(f.k * 1.9, 0.5);
    return { k, x: w / 2 - sx * k, y: h / 2 - sy * k };
  }, [computeFit, layouts]);

  const fitView = useCallback(
    (animate = true, home = false) => {
      const f = computeFit();
      fitK.current = f.k;
      const target = home ? homeView() : f;
      camTarget.current = target;
      if (!animate) cam.current = { ...target };
      userMoved.current = false;
    },
    [computeFit, homeView],
  );

  const clampCam = useCallback(() => {
    const { w, h } = view.current;
    const c = camTarget.current;
    const kMin = fitK.current * 0.7;
    c.k = Math.max(kMin, Math.min(2.8, c.k));
    // aspoň časť ostrova musí ostať na obrazovke
    const cx0 = c.x + FIT.x0 * c.k;
    const cx1 = c.x + FIT.x1 * c.k;
    const cy0 = c.y + FIT.y0 * c.k;
    const cy1 = c.y + FIT.y1 * c.k;
    const margin = 120;
    if (cx1 < margin) c.x += margin - cx1;
    if (cx0 > w - margin) c.x -= cx0 - (w - margin);
    if (cy1 < margin) c.y += margin - cy1;
    if (cy0 > h - margin) c.y -= cy0 - (h - margin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number, instant = false) => {
      const c = camTarget.current;
      const k2 = Math.max(fitK.current * 0.7, Math.min(2.8, c.k * factor));
      const f = k2 / c.k;
      c.x = px - (px - c.x) * f;
      c.y = py - (py - c.y) * f;
      c.k = k2;
      clampCam();
      userMoved.current = true;
      if (instant) cam.current = { ...c };
    },
    [clampCam],
  );

  const focusOn = useCallback(
    (sx: number, sy: number, k: number) => {
      const { w, h } = view.current;
      const panel = w >= 768 ? 392 : 0;
      const usableW = w - panel;
      const kk = Math.max(0.9, k);
      const bottomPanel = w < 768 ? h * 0.32 : 0;
      camTarget.current = {
        k: kk,
        x: usableW / 2 - sx * kk,
        y: (h - bottomPanel) / 2 - sy * kk,
      };
      userMoved.current = true;
    },
    [],
  );

  // ── výber ───────────────────────────────────────────────────────────────
  const select = useCallback(
    (sel: string | null) => {
      setSelected(sel);
      setHintVisible(false);
      if (!sel) {
        if (!dragMoved.current) fitView(true, view.current.w < 640);
        return;
      }
      const [kind, id] = sel.split(":");
      if (kind === "agent") {
        const a = agentById(id);
        const l = a && layouts[a.id];
        if (l) {
          const [sx, sy] = iso(l.house.gx + l.house.w * 0.55, l.front + 0.6, 40);
          focusOn(sx, sy, 1.25);
        }
        setHops((h) => ({ ...h, [id]: (h[id] ?? 0) + 1 }));
      } else {
        const p = plotById(id);
        if (p) {
          const [sx, sy] = iso(p.gx + p.w / 2, p.gy + p.d / 2, 30);
          focusOn(sx, sy, 1.15);
        }
      }
    },
    [fitView, focusOn, layouts],
  );

  // ── hlavná slučka ───────────────────────────────────────────────────────
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const plotLabelRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<string | null>(null);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
  const sigRef = useRef("");
  const staticBoundsRef = useRef<Bounds[]>([]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // kamera
      const c = cam.current;
      const t = camTarget.current;
      const k = 1 - Math.pow(0.0012, dt);
      if (!dragging.current) {
        c.x += (t.x - c.x) * k;
        c.y += (t.y - c.y) * k;
        c.k += (t.k - c.k) * k;
      }
      const tf = `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${c.k.toFixed(4)})`;
      camGRef.current?.setAttribute("transform", tf);
      lightsGRef.current?.setAttribute("transform", tf);

      // postavičky
      let sig = "";
      for (const a of AGENTS) {
        const ac = actors.current[a.id];
        if (!ac) continue;
        const status = statusRef.current[a.id] ?? "idle";
        const held = hoverRef.current === `agent:${a.id}` || selectedRef.current === `agent:${a.id}`;

        // túlanie po ostrove, keď je agent nečinný
        if (status === "idle" && !held) {
          if (!ac.strolling && now > ac.strollAt && ac.arrived && ac.node === "seat") {
            ac.strolling = true;
          }
          if (ac.strolling && ac.arrived && ac.node === "plaza" && ac.returnAt === 0) ac.returnAt = now + 6500;
          if (ac.strolling && ac.returnAt && now > ac.returnAt) {
            ac.strolling = false;
            ac.returnAt = 0;
            ac.strollAt = now + 30_000 + Math.random() * 25_000;
          }
        } else if (ac.strolling) {
          ac.strolling = false;
          ac.returnAt = 0;
          ac.strollAt = now + 30_000;
        }

        const want = desiredDest(ac, status);
        if (want !== ac.dest || (ac.arrived && ac.node !== want)) {
          ac.dest = want;
          const names = routeNames(ac.layout, ac.node, want);
          ac.route = [[ac.gx, ac.gy], ...names.slice(1).map((n) => ac.layout.nodes[n])];
          ac.routeNames = names.slice(1);
          ac.arrived = ac.route.length <= 1;
          if (ac.arrived) ac.node = want;
        }

        let moving = false;
        if (!ac.arrived && ac.route.length > 1) {
          const [tx, ty] = ac.route[1];
          const dx = tx - ac.gx;
          const dy = ty - ac.gy;
          const dist = Math.hypot(dx, dy);
          const step = 1.55 * dt;
          moving = true;
          const sdx = dx - dy;
          if (Math.abs(sdx) > 0.02) ac.dir = sdx >= 0 ? 1 : -1;
          if (dist <= step) {
            ac.gx = tx;
            ac.gy = ty;
            ac.route.shift();
            const reached = ac.routeNames.shift();
            if (reached) ac.node = reached;
            if (ac.route.length <= 1) {
              ac.arrived = true;
              ac.node = ac.dest;
              moving = false;
              ac.dir = 1;
            }
          } else {
            ac.gx += (dx / dist) * step;
            ac.gy += (dy / dist) * step;
          }
        }

        ac.pose = moving ? "walk" : poseAt(ac.node, status, nightRef.current);
        if (ac.pose !== ac.shownPose || ac.dir !== ac.shownDir) {
          ac.shownPose = ac.pose;
          ac.shownDir = ac.dir;
          setPoseState((s) => ({ ...s, [ac.id]: { pose: ac.pose, dir: ac.dir } }));
        }

        const [sx, sy] = iso(ac.gx, ac.gy);
        ac.g?.setAttribute("transform", `translate(${sx.toFixed(2)} ${sy.toFixed(2)}) scale(${CS})`);

        // hĺbkové radenie voči statickým objektom
        for (const b of staticBoundsRef.current) sig += ac.gx >= b.x1 || ac.gy >= b.y1 ? "1" : "0";
        sig += "|";

        // bublina nad hlavou
        const el = bubbleRefs.current[a.id];
        if (el) {
          const bx = c.x + sx * c.k;
          const by = c.y + (sy - 100 * CS) * c.k;
          el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
        }
      }
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setDepthTick((n) => n + 1);
      }

      // štítok prázdnej parcely pod myšou
      const pl = plotLabelRef.current;
      const hv = hoverRef.current;
      if (pl) {
        if (hv?.startsWith("plot:")) {
          const p = plotById(hv.slice(5));
          if (p) {
            const [sx, sy] = iso(p.gx + p.w / 2, p.gy + p.d / 2, 140);
            pl.style.transform = `translate(${(c.x + sx * c.k).toFixed(1)}px, ${(c.y + sy * c.k).toFixed(1)}px)`;
          }
        }
        pl.style.opacity = hv?.startsWith("plot:") ? "1" : "0";
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // ── veľkosť a vstupy ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      view.current = { w: r.width, h: r.height };
      if (!userMoved.current) fitView(!(cam.current.k === 0.6 && cam.current.x === 0), r.width < 640);
      else fitK.current = computeFit().k;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
      setHintVisible(false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [fitView, computeFit, zoomAt]);

  // ťahanie a pinch
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startPt = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ dist: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startPt.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = containerRef.current!.getBoundingClientRect();
      zoomAt(d / pinch.current.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, true);
      pinch.current.dist = d;
      dragMoved.current = true;
      return;
    }
    if (!dragging.current) {
      if (Math.hypot(e.clientX - startPt.current.x, e.clientY - startPt.current.y) < 6) return;
      dragging.current = true;
      dragMoved.current = true;
      containerRef.current?.setPointerCapture(e.pointerId);
      setHintVisible(false);
    }
    const c = camTarget.current;
    c.x += dx;
    c.y += dy;
    clampCam();
    cam.current.x = c.x;
    cam.current.y = c.y;
    userMoved.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (dragging.current && pointers.current.size === 0) {
      dragging.current = false;
      setTimeout(() => (dragMoved.current = false), 0);
    }
  };

  // ── entity scény ────────────────────────────────────────────────────────
  const lightsOn = P.lights;
  const hoverId = hover;
  const working = (id: string) => statusOf(id) === "working";

  const staticEntities = useMemo(() => {
    const list: { key: string; b: Bounds; node: React.ReactNode }[] = [];

    TREES.forEach((t, i) =>
      list.push({ key: `tree${i}`, b: pointBox(t.gx, t.gy, 0.25), node: <Tree gx={t.gx} gy={t.gy} kind={t.kind} s={t.s} seed={i} /> }),
    );
    BUSHES.forEach(([gx, gy, s], i) => list.push({ key: `bush${i}`, b: pointBox(gx, gy, 0.2), node: <Bush gx={gx} gy={gy} s={s} /> }));
    FLOWERS.forEach(([gx, gy], i) => list.push({ key: `fl${i}`, b: pointBox(gx, gy, 0.2), node: <Flowers gx={gx} gy={gy} /> }));
    ROCKS.forEach(([gx, gy, s], i) => list.push({ key: `rock${i}`, b: pointBox(gx, gy, 0.2), node: <Rock gx={gx} gy={gy} s={s} /> }));
    LAMPS.forEach(([gx, gy], i) => list.push({ key: `lamp${i}`, b: pointBox(gx, gy, 0.1), node: <Lamp gx={gx} gy={gy} /> }));
    list.push({ key: "fountain", b: { x0: 6.0, x1: 8.0, y0: 6.0, y1: 8.0 }, node: <HoloCore gx={7} gy={7} /> });
    list.push({ key: "bench1", b: { x0: 2.8, x1: 3.8, y0: 5.7, y1: 6.05 }, node: <Bench gx={2.8} gy={5.7} along="x" /> });
    DEPARTMENTS.forEach((d) =>
      list.push({ key: `sign-${d.id}`, b: pointBox(d.sign[0], d.sign[1], 0.12), node: <Signpost gx={d.sign[0]} gy={d.sign[1]} label={d.name} sub={d.tagline} color={d.color} /> }),
    );

    // parcely: domy alebo prázdne pozemky
    PLOTS.forEach((plot) => {
      const agent = AGENTS.find((a) => a.plot === plot.id);
      const dept = departmentById(plot.department);
      if (!agent || !dept) {
        list.push({
          key: `plot-${plot.id}`,
          b: { x0: plot.gx, x1: plot.gx + plot.w, y0: plot.gy, y1: plot.gy + plot.d },
          node: (
            <g
              onPointerEnter={() => setHover(`plot:${plot.id}`)}
              onPointerLeave={() => setHover((h) => (h === `plot:${plot.id}` ? null : h))}
              onClick={() => !dragMoved.current && select(`plot:${plot.id}`)}
            >
              <EmptyPlot gx={plot.gx} gy={plot.gy} w={plot.w} d={plot.d} color={dept?.color ?? "#94a3b8"} hover={hoverId === `plot:${plot.id}`} selected={selected === `plot:${plot.id}`} />
            </g>
          ),
        });
        return;
      }
      const l = layouts[agent.id];
      if (!l) return;
      const h = l.house;
      const st = statusOf(agent.id);
      const snap = snapshots?.[agent.id];
      const isHover = hoverId === `agent:${agent.id}`;
      const isSel = selected === `agent:${agent.id}`;
      list.push({
        key: `house-${agent.id}`,
        b: { x0: h.gx, x1: h.gx + h.w, y0: h.gy, y1: h.gy + h.d },
        node: (
          <g
            onPointerEnter={() => setHover(`agent:${agent.id}`)}
            onPointerLeave={() => setHover((x) => (x === `agent:${agent.id}` ? null : x))}
            onClick={() => !dragMoved.current && select(`agent:${agent.id}`)}
            style={{ cursor: "pointer" }}
          >
            {(isSel || st === "waiting" || st === "error") && (
              <ellipse
                cx={iso(h.gx + h.w / 2, h.gy + h.d / 2)[0]}
                cy={iso(h.gx + h.w / 2, h.gy + h.d / 2)[1] + 10}
                rx={h.w * 74}
                ry={h.w * 36}
                fill="none"
                stroke={isSel ? "#ffffff" : STATUS_COLOR[st]}
                strokeWidth={3}
                className="ag-ring"
                opacity={0.8}
              />
            )}
            <House g={h} name={agent.name} status={st} accent={agent.look.accent} hover={isHover || isSel} />
          </g>
        ),
      });
      list.push({ key: `fenceL-${agent.id}`, b: { x0: plot.gx, x1: plot.gx, y0: plot.gy + 0.6, y1: l.front + 1.2 }, node: <Fence from={[plot.gx, plot.gy + 0.6]} to={[plot.gx, l.front + 1.2]} /> });
      list.push({ key: `fenceR-${agent.id}`, b: { x0: plot.gx + plot.w, x1: plot.gx + plot.w, y0: plot.gy + 0.6, y1: l.front + 1.2 }, node: <Fence from={[plot.gx + plot.w, plot.gy + 0.6]} to={[plot.gx + plot.w, l.front + 1.2]} /> });
      list.push({ key: `chair-${agent.id}`, b: { x0: l.chair.gx, x1: l.chair.gx + 0.42, y0: l.chair.gy, y1: l.front + 0.36 }, node: <Chair gx={l.chair.gx} gy={l.chair.gy} /> });
      list.push({ key: `desk-${agent.id}`, b: { x0: l.desk.gx, x1: l.desk.gx + 0.9, y0: l.desk.gy, y1: l.desk.gy + 0.5 }, node: <Workstation gx={l.desk.gx} gy={l.desk.gy} working={st === "working"} /> });
      if (st === "working")
        list.push({ key: `holo-${agent.id}`, b: { x0: l.desk.gx, x1: l.desk.gx + 0.9, y0: l.desk.gy + 0.6, y1: l.desk.gy + 0.7 }, node: <HoloChips gx={l.desk.gx} gy={l.desk.gy} step={snap?.detail} chips={agent.chips} /> });
      list.push({ key: `table-${agent.id}`, b: { x0: l.table.gx, x1: l.table.gx + 0.6, y0: l.table.gy, y1: l.table.gy + 0.6 }, node: <ApprovalTable gx={l.table.gx} gy={l.table.gy} count={(snap?.counters.researchReady ?? 0) + (snap?.counters.draftsWaiting ?? 0)} waiting={st === "waiting"} /> });
      list.push({ key: `mail-${agent.id}`, b: pointBox(l.mailbox.gx, l.mailbox.gy, 0.15), node: <Mailbox gx={l.mailbox.gx} gy={l.mailbox.gy} raised={st === "waiting" || (snap?.counters.draftsWaiting ?? 0) + (snap?.counters.researchReady ?? 0) > 0} /> });
      list.push({ key: `lamp-${agent.id}`, b: pointBox(l.nodes.table[0] + 0.55, l.front + 0.32, 0.1), node: <Lamp gx={l.nodes.table[0] + 0.55} gy={l.front + 0.32} /> });
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId, selected, snapshots, layouts, select]);

  useEffect(() => {
    staticBoundsRef.current = staticEntities.map((e) => e.b);
  }, [staticEntities]);

  const sorted = useMemo(() => {
    const items = [...staticEntities];
    for (const a of AGENTS) {
      const ac = actors.current[a.id];
      if (!ac) continue;
      const ps = poseState[a.id] ?? { pose: "sit" as Pose, dir: 1 as const };
      const isHover = hoverId === `agent:${a.id}`;
      items.push({
        key: `actor-${a.id}`,
        b: { x0: ac.gx, x1: ac.gx, y0: ac.gy, y1: ac.gy },
        node: (
          <g
            onPointerEnter={() => {
              setHover(`agent:${a.id}`);
              setHops((h) => ({ ...h, [a.id]: (h[a.id] ?? 0) + 1 }));
              say(a.id, lineFor(a, "hover"), 4800);
            }}
            onPointerLeave={() => setHover((x) => (x === `agent:${a.id}` ? null : x))}
            onClick={() => !dragMoved.current && select(`agent:${a.id}`)}
            style={{ cursor: "pointer" }}
          >
            <g
              ref={(el) => {
                ac.g = el;
                if (el && !el.getAttribute("transform")) {
                  const [sx, sy] = iso(ac.gx, ac.gy);
                  el.setAttribute("transform", `translate(${sx.toFixed(2)} ${sy.toFixed(2)}) scale(${CS})`);
                }
              }}
            >
              <Character look={a.look} pose={ps.pose} dir={ps.dir} hop={hops[a.id] ?? 0} />
              {isHover && <ellipse cx={0} cy={2} rx={24} ry={8} fill="none" stroke="#fff" strokeWidth={2} opacity={0.85} />}
              <rect x={-26} y={-104} width={52} height={110} fill="rgba(0,0,0,0)" />
            </g>
          </g>
        ),
      });
    }
    return depthSort(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticEntities, poseState, hops, depthTick, hoverId, say, lineFor, select]);

  // ── HUD ─────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<AgentStatus, number> = { working: 0, waiting: 0, idle: 0, error: 0 };
    for (const a of AGENTS) c[snapshots?.[a.id]?.status ?? "idle"]++;
    return c;
  }, [snapshots]);

  const stars = useMemo(() => {
    const r = (() => {
      let s = 7;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    return Array.from({ length: 70 }).map((_, i) => ({ id: i, x: r() * 100, y: r() * 48, d: r() * 3, s: 1 + r() * 2 }));
  }, []);

  const selectedAgent = selected?.startsWith("agent:") ? agentById(selected.slice(6)) : undefined;
  const selectedPlot = selected?.startsWith("plot:") ? plotById(selected.slice(5)) : undefined;
  const hoverPlot = hover?.startsWith("plot:") ? plotById(hover.slice(5)) : undefined;

  const phaseButtons: { id: PhaseMode; icon: React.ReactNode; label: string }[] = [
    { id: "auto", icon: <span className="text-[10px] font-bold">AUTO</span>, label: "Podľa času" },
    { id: "day", icon: <Sun className="h-3.5 w-3.5" />, label: "Deň" },
    { id: "dusk", icon: <Sunset className="h-3.5 w-3.5" />, label: "Súmrak" },
    { id: "night", icon: <Moon className="h-3.5 w-3.5" />, label: "Noc" },
  ];

  const planetGlow = "0 0 40px 4px rgba(90,150,255,.24), inset -22px -18px 36px rgba(0,0,20,.72)";
  const celestial = {
    day: { x: "80%", y: "17%", size: 118, bg: "radial-gradient(circle at 30% 26%,#b4d2ff 0%,#4f78cc 30%,#1e3474 60%,#070d26 100%)", o: 1, glow: planetGlow },
    dawn: { x: "80%", y: "20%", size: 118, bg: "radial-gradient(circle at 30% 26%,#cdbcff 0%,#6a6ccf 30%,#2a2f78 60%,#080c28 100%)", o: 1, glow: planetGlow },
    dusk: { x: "80%", y: "20%", size: 118, bg: "radial-gradient(circle at 30% 26%,#d2c4ff 0%,#7a72d2 30%,#2e2c74 60%,#080a26 100%)", o: 1, glow: planetGlow },
    night: { x: "80%", y: "17%", size: 108, bg: "radial-gradient(circle at 30% 26%,#7d9ee0 0%,#2d4a94 32%,#101c48 62%,#050914 100%)", o: 1, glow: planetGlow },
  }[phase];

  return (
    <div
      ref={containerRef}
      className="ag-root relative h-full w-full cursor-grab overflow-hidden rounded-2xl border border-cyan-400/25 shadow-[0_0_0_1px_rgba(8,15,35,0.9),0_18px_60px_-20px_rgba(34,211,238,0.25)] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).tagName === "svg") {
          if (!dragMoved.current && selected) select(null);
        }
      }}
    >
      {/* nebo */}
      {(Object.keys(SKY) as Phase[]).map((p) => (
        <div key={p} className="ag-sky-layer" style={{ background: SKY[p], opacity: p === phase ? 1 : 0 }} />
      ))}
      <div className="ag-sky-layer" style={{ opacity: P.stars }}>
        {stars.map((s) => (
          <span key={s.id} className="ag-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      <div
        className="ag-celestial"
        style={{ left: celestial.x, top: celestial.y, width: celestial.size, height: celestial.size, background: celestial.bg, transform: "translate(-50%,-50%)", opacity: celestial.o, boxShadow: "glow" in celestial ? celestial.glow : "none" }}
      />

      {/* scéna */}
      <svg className="absolute inset-0 h-full w-full" onClick={undefined}>
        <WorldDefs />
        <g ref={camGRef}>
          <Clouds />
          <Island />
          <Ground />
          {PLOTS.filter((p) => AGENTS.some((a) => a.plot === p.id)).map((p) => (
            <g key={p.id}>
              <polygon points={footprint(p.gx, p.gy, p.w, p.d)} fill="#0a1226" opacity={0.75} />
              <polygon points={footprint(p.gx, p.gy, p.w, p.d)} fill="none" stroke="#3f5390" strokeWidth={1.4} opacity={0.8} />
            </g>
          ))}
          {sorted.map((e) => (
            <g key={e.key}>{e.node}</g>
          ))}
          <Birds />
        </g>
      </svg>

      {/* zatmavenie */}
      <div className="ag-tint" style={{ ["--ag-tint" as string]: P.tint } as React.CSSProperties} />

      {/* svetlá (nad zatmavením) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ mixBlendMode: "screen" }}>
        <g ref={lightsGRef}>
          <g className="ag-fade" style={{ opacity: lightsOn ? 1 : 0 }}>
            {LAMPS.map(([gx, gy], i) => {
              const [x, y] = iso(gx, gy);
              return (
                <g key={i}>
                  <ellipse cx={x} cy={y + 4} rx={62} ry={28} fill="url(#ag-ground-glow)" />
                  <circle cx={x} cy={y - 72} r={62} fill="url(#ag-lamp-glow)" />
                </g>
              );
            })}
            {AGENTS.map((a) => {
              const l = layouts[a.id];
              if (!l) return null;
              const [lx, ly] = iso(l.nodes.table[0] + 0.55, l.front + 0.32);
              const [dx, dy] = iso(l.desk.gx + 0.5, l.desk.gy + 0.2, 40);
              return (
                <g key={a.id}>
                  <ellipse cx={lx} cy={ly + 4} rx={62} ry={28} fill="url(#ag-ground-glow)" />
                  <circle cx={lx} cy={ly - 72} r={62} fill="url(#ag-lamp-glow)" />
                  {working(a.id) && <ellipse cx={dx} cy={dy} rx={70} ry={38} fill="#6fd3ff" opacity={0.22} />}
                </g>
              );
            })}
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i * 137.5 * Math.PI) / 180;
              const [x, y] = iso(1 + ((Math.sin(a) + 1) / 2) * 12, 1 + ((Math.cos(a * 1.3) + 1) / 2) * 12, 24 + (i % 4) * 14);
              return (
                <circle key={i} cx={x} cy={y} r={2.4} fill="#9ff3ff" className="ag-firefly" style={{ animationDelay: `${-i * 0.9}s`, animationDuration: `${7 + (i % 5)}s`, ["--fx" as string]: `${(i % 2 ? 1 : -1) * (16 + (i % 3) * 8)}px`, ["--fy" as string]: `${-10 - (i % 4) * 5}px` } as React.CSSProperties} />
              );
            })}
          </g>
          {AGENTS.map((a) => {
            const l = layouts[a.id];
            return l ? <HouseLights key={a.id} g={l.house} on={lightsOn || statusOf(a.id) === "working"} /> : null;
          })}
        </g>
      </svg>

      <div className="ag-vignette" />
      <div className="ag-frame">
        <i />
        <i />
        <i />
        <i />
      </div>

      {/* bubliny a štítky nad hlavami */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {AGENTS.map((a) => {
          const st = statusOf(a.id);
          const sp = speech[a.id];
          const col = STATUS_COLOR[st];
          return (
            <div key={a.id} ref={(el) => { bubbleRefs.current[a.id] = el; }} className="ag-bubble">
              <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1.5 pb-1">
                {sp && (
                  <div key={sp.id} className="ag-bubble-inner relative max-w-[240px] rounded-lg border border-cyan-300/25 bg-[#07101f]/92 px-3 py-2 text-[12.5px] leading-snug text-foreground shadow-xl shadow-black/40 backdrop-blur-md">
                    {sp.text}
                    <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r border-cyan-300/25 bg-[#07101f]/92" />
                  </div>
                )}
                <div className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-cyan-300/25 bg-[#07101f]/88 px-2.5 py-1 text-[11.5px] font-semibold text-foreground shadow-lg shadow-black/30 backdrop-blur-md">
                  <span className={cn("h-2 w-2 rounded-full", st !== "idle" && "animate-pulse")} style={{ background: col, boxShadow: `0 0 8px ${col}` }} />
                  {a.name}
                  <span className="font-normal text-muted">{snapshots ? statusLabel(a, st) : "Načítavam…"}</span>
                  {st === "waiting" && (snapshots?.[a.id]?.counters.draftsWaiting ?? 0) + (snapshots?.[a.id]?.counters.researchReady ?? 0) > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black">{(snapshots?.[a.id]?.counters.draftsWaiting ?? 0) + (snapshots?.[a.id]?.counters.researchReady ?? 0)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={plotLabelRef} className="ag-bubble" style={{ opacity: 0, transition: "opacity .2s" }}>
          {hoverPlot && (
            <div className="-translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-white/15 bg-[#0d1524]/92 px-3 py-1.5 text-center shadow-xl shadow-black/40 backdrop-blur-md">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted">Voľná parcela</div>
              <div className="text-[12.5px] font-semibold text-foreground">{hoverPlot.idea.title}</div>
            </div>
          )}
        </div>
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/12 bg-[#0d1524]/80 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
          <span className="font-semibold tracking-wide text-foreground max-md:hidden">OPERAČNÉ CENTRUM</span>
          <span className="h-3 w-px bg-white/15 max-md:hidden" />
          {(["working", "waiting", "idle", "error"] as AgentStatus[])
            .filter((s) => counts[s] > 0 || s !== "error")
            .map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                <span className="font-semibold text-foreground tabular-nums">{counts[s]}</span>
                {s === "working" ? "pracuje" : s === "waiting" ? "čaká na teba" : s === "idle" ? "má voľno" : "chyba"}
              </span>
            ))}
        </div>
        {error && <div className="pointer-events-auto rounded-lg bg-red-500/20 px-2.5 py-1.5 text-[11px] text-red-300">Stav sa nepodarilo načítať ({error})</div>}
        <GuideChip
          onOpenWorkbench={(leadId) => {
            if (leadId) setPinnedLead(leadId);
            setWorkbench(true);
          }}
        />
        {budget && <BudgetChip budget={budget} />}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {AGENTS.map((a) => {
            const st = statusOf(a.id);
            return (
              <button
                key={a.id}
                onClick={() => select(`agent:${a.id}`)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-white/12 bg-[#0d1524]/80 px-2.5 py-1 text-[11.5px] font-medium text-foreground shadow-lg backdrop-blur-md transition hover:bg-white/10",
                  selected === `agent:${a.id}` && "border-white/40 bg-white/15",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", st !== "idle" && "animate-pulse")} style={{ background: STATUS_COLOR[st] }} />
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 max-md:top-14">
        <div className={cn("flex items-center gap-1 rounded-xl border border-white/12 bg-[#0d1524]/80 p-1 shadow-lg backdrop-blur-md transition-opacity", selected && "md:opacity-0 md:pointer-events-none")}>
          {phaseButtons.map((b) => (
            <button
              key={b.id}
              title={b.label}
              onClick={() => setMode(b.id)}
              className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-muted transition hover:text-foreground",
                mode === b.id && "bg-white/15 text-foreground",
              )}
            >
              {b.icon}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-xl border border-white/12 bg-[#0d1524]/80 p-1 shadow-lg backdrop-blur-md", selectedAgent || selectedPlot ? "max-md:hidden" : "")}>
        <button title="Priblížiť" onClick={() => { const { w, h } = view.current; zoomAt(1.25, w / 2, h / 2); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/10 hover:text-foreground">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button title="Oddialiť" onClick={() => { const { w, h } = view.current; zoomAt(0.8, w / 2, h / 2); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/10 hover:text-foreground">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button title="Zobraziť celé centrum" onClick={() => { fitView(true, false); setSelected(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/10 hover:text-foreground">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {hintVisible && !selected && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/12 bg-[#0d1524]/80 px-3.5 py-1.5 text-[11.5px] text-muted shadow-lg backdrop-blur-md max-md:hidden">
          Ťahaj = posun · koleso = priblíženie · klikni na agenta alebo voľnú parcelu
        </div>
      )}

      {/* paneli */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentPanel
            key={selectedAgent.id}
            agent={selectedAgent}
            snap={snapshots?.[selectedAgent.id] ?? null}
            onClose={() => select(null)}
            onSay={(t) => say(selectedAgent.id, t, 6500)}
            onOpenWorkbench={() => setWorkbench(true)}
          />
        )}
        {selectedPlot && <PlotPanel key={selectedPlot.id} plot={selectedPlot} onClose={() => select(null)} />}
      </AnimatePresence>

      {workbench && (
        <Workbench
          initialLeadId={pinnedLead}
          onClose={() => {
            setWorkbench(false);
            setPinnedLead(null);
          }}
          onChanged={refresh}
        />
      )}

    </div>
  );
}
