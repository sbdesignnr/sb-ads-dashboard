// Klientský "bežec" hromadnej analýzy webov. Beží MIMO React komponentu (modul
// žije, kým je otvorená karta prehliadača), takže prechod na detail leadu a späť
// slučku nezastaví — predtým bola slučka v komponente stránky: po návrate sa
// stránka vytvorila znova, tlačidlo bolo opäť klikateľné a druhé spustenie robilo
// tie isté leady naraz (alebo, pri "Preanalyzovať staré", zmazalo hotovú prácu).
//
// Progres sa NEDRŽÍ tu, ale počíta sa z DB (GET /api/leads/analyze-bulk?since=…),
// takže prežije aj reload stránky. Tu je len info "beží / nebeží" a začiatok behu
// (v localStorage), aby sa dal ukázať pomer "X z Y".

import toast from "react-hot-toast";

export interface AnalysisRunState {
  running: boolean;
  /** segment id alebo "all" */
  scope: string;
  startedAt: number | null;
  /** koľko leadov dokončil TENTO beh (na odhad zostávajúceho času) */
  doneInRun: number;
  error: string | null;
}

export interface StoredRun {
  scope: string;
  /** čas servera (ISO), od ktorého počítame hotové leady */
  since: string;
}

const IDLE: AnalysisRunState = {
  running: false,
  scope: "all",
  startedAt: null,
  doneInRun: 0,
  error: null,
};

const RUN_KEY = "leads:analysis-run";

let state: AnalysisRunState = IDLE;
let stopRequested = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<AnalysisRunState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getAnalysisRunState = () => state;
export const getServerAnalysisRunState = () => IDLE;
export function subscribeAnalysisRun(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function readStoredRun(): StoredRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<StoredRun>;
    return typeof j.scope === "string" && typeof j.since === "string"
      ? { scope: j.scope, since: j.since }
      : null;
  } catch {
    return null;
  }
}

function writeStoredRun(run: StoredRun | null) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* localStorage nedostupný — progres sa len nezobrazí ako "X z Y" */
  }
}

/** Začiatok behu pre daný pohľad (segment), ak ho vieme použiť na "X z Y". */
export function storedRunFor(segment: string): StoredRun | null {
  const run = readStoredRun();
  if (!run) return null;
  // Beh "všetky" pokrýva aj ktorýkoľvek segment; beh segmentu len ten segment.
  return run.scope === segment || run.scope === "all" ? run : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ProgressResponse {
  remaining: number;
  now: string;
}

async function fetchProgress(scope: string): Promise<ProgressResponse> {
  const r = await fetch(
    `/api/leads/analyze-bulk?segment=${encodeURIComponent(scope)}`,
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

interface BatchResponse {
  processed: number;
  analyzed: number;
  qualified: number;
  remaining: number;
}

async function postBatch(scope: string): Promise<BatchResponse> {
  const r = await fetch("/api/leads/analyze-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmentId: scope }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

async function run(scope: string) {
  let failures = 0;
  let idleRounds = 0;
  let finished = false;
  try {
    const first = await fetchProgress(scope);
    if (first.remaining === 0) {
      writeStoredRun(null);
      toast.success("Nič na analýzu.");
      return;
    }
    // Rozbehnutý (pozastavený) beh toho istého rozsahu pokračuje s pôvodným
    // začiatkom — "X z Y" sa neresetuje na nulu.
    const prev = readStoredRun();
    writeStoredRun({
      scope,
      since: prev && prev.scope === scope ? prev.since : first.now,
    });

    while (!stopRequested) {
      try {
        const res = await postBatch(scope);
        failures = 0;
        setState({ doneInRun: state.doneInRun + (res.analyzed ?? 0) });
        if (res.remaining === 0) {
          finished = true;
          break;
        }
        // Nič sa nedokončilo (napr. všetko naraz narazilo na časový limit) —
        // nezacykliť sa donekonečna.
        if (!res.analyzed) {
          idleRounds++;
          if (idleRounds >= 2) throw new Error("no_progress");
          await sleep(4000);
        } else {
          idleRounds = 0;
        }
      } catch (err) {
        // Jedna zlyhaná dávka (sieť, 504…) beh NEUKONČÍ — leady zostali nezanalyzované
        // a vezmú sa nabudúce. Až 4 zlyhania v rade = naozajstný problém.
        if (err instanceof Error && err.message === "no_progress") throw err;
        failures++;
        if (failures >= 4) throw err;
        await sleep(3000 * failures);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "chyba";
    setState({ error: msg });
    toast.error(
      "Analýza sa zastavila (chyba servera/siete). Nič sa nestratilo — klikni „Pokračovať“.",
      { duration: 8000 },
    );
  } finally {
    window.removeEventListener("beforeunload", onBeforeUnload);
    setState({ running: false });
    if (finished) {
      writeStoredRun(null);
      toast.success(`✅ Analýza dokončená (${state.doneInRun} webov)`, {
        duration: 6000,
      });
    } else if (stopRequested) {
      toast("Analýza pozastavená — pokračuj, kedy chceš.");
    }
  }
}

/**
 * Spustí analýzu (rozsah = id segmentu alebo "all"). Vráti false, ak už nejaká
 * beží — druhé spustenie sa ignoruje, nie zdvojí.
 */
export function startAnalysis(scope: string): boolean {
  if (state.running) return false;
  stopRequested = false;
  window.addEventListener("beforeunload", onBeforeUnload);
  state = { running: true, scope, startedAt: Date.now(), doneInRun: 0, error: null };
  listeners.forEach((l) => l());
  void run(scope);
  return true;
}

/** Požiada slučku, aby po dokončení aktuálnej dávky skončila (nič sa nestratí). */
export function stopAnalysis(): void {
  stopRequested = true;
}
