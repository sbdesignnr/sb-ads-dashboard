"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Target,
  Settings,
  Loader2,
  Globe,
  User,
  Phone,
  MapPin,
  Gauge,
  Layers,
  Mail,
  MailCheck,
  BarChart3,
  Check,
  Upload,
  Sparkles,
  EyeOff,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type LeadDTO,
  type SegmentDTO,
  type LeadStatus,
  LEAD_STATUS_LABEL,
} from "@/lib/leads/types";
import { QUALIFY_AT, BORDERLINE_AT, scoreTier } from "@/lib/leads/qualification";
import {
  getAnalysisRunState,
  getServerAnalysisRunState,
  startAnalysis,
  subscribeAnalysisRun,
} from "@/lib/leads/analysis-runner";
import { AnalysisProgress } from "@/components/leads/AnalysisProgress";
import { isVerifiedOwnerSource, OWNER_SOURCE_LABEL } from "@/lib/leads/owner-source";

type StatusFilter = LeadStatus | "all";

// Záložky filtrujú podľa oslovenosti (nie technického stavu) — reč používateľa.
// „Oslovení" (value=contacted) na serveri pokrýva aj reagoval/konvertoval.
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "new", label: "Neoslovení" },
  { value: "contacted", label: "Oslovení" },
  { value: "responded", label: "Reagovali" },
  { value: "all", label: "Všetci" },
  // Automaticky skryté (web v poriadku) aj ručne zamietnuté — dajú sa odtiaľ vrátiť.
  { value: "rejected", label: "Skryté" },
];

/** Krátky dátum, napr. „14. 7.". */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

const STATUS_VARIANT: Record<
  LeadStatus,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  new: "info",
  contacted: "warning",
  responded: "success",
  converted: "success",
  rejected: "default",
};

// Farba podľa úrovne (zdieľaný prah z lib/leads/qualification): červená = zlý web
// = vhodný lead, žltá = hraničný, zelená = web v poriadku. Predtým sa farbilo
// pevnými číslami 40/60, takže zjavne zastaraný web so skóre 28 svietil zelený.
function scoreClasses(score: number | null): string {
  switch (scoreTier(score)) {
    case "qualified":
      return "bg-danger/15 text-danger";
    case "borderline":
      return "bg-warning/15 text-warning";
    case "good":
      return "bg-success/15 text-success";
    default:
      return "bg-surface-2 text-muted";
  }
}

function host(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LeadsPage() {
  const [segments, setSegments] = useState<SegmentDTO[]>([]);
  const [leads, setLeads] = useState<LeadDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [segment, setSegment] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("new");
  const [region, setRegion] = useState("all");
  // Predvolene len leady VHODNÉ na oslovenie (nemieša sa s hraničnými ani s
  // webmi v poriadku). Ostatné skupiny sú v tom istom výbere s počtami.
  const [quality, setQuality] = useState("bad"); // all | bad | borderline | good | unscored
  const [qualityCounts, setQualityCounts] = useState<{
    bad: number;
    borderline: number;
    good: number;
    unscored: number;
  } | null>(null);
  const [regions, setRegions] = useState<
    { region: string | null; count: number }[]
  >([]);
  const [contactedCount, setContactedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hiding, setHiding] = useState(false);

  // CSV import + následná analýza importovaných leadov.
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [analyzeAsk, setAnalyzeAsk] = useState<number | null>(null);
  // "Beží analýza" žije v module analysis-runner (mimo tejto stránky), takže
  // prechod na detail leadu a späť ho nezresetuje ani nedovolí spustiť druhý beh.
  const analyzing = useSyncExternalStore(
    subscribeAnalysisRun,
    () => getAnalysisRunState().running,
    () => getServerAnalysisRunState().running,
  );
  const [pendingAnalysis, setPendingAnalysis] = useState(0);
  const [staleCount, setStaleCount] = useState(0);

  // Obmedzené na aktuálne zvolený segment (rovnaká logika ako loadLeads) — nech
  // tlačidlo ukazuje, koľko treba analyzovať PRE TENTO segment, nie naprieč všetkými.
  const loadPendingAnalysis = useCallback(async () => {
    try {
      const j = await fetch(
        `/api/leads/analyze-bulk?segment=${encodeURIComponent(segment)}`,
      ).then((r) => r.json());
      setPendingAnalysis(j.remaining ?? 0);
    } catch {
      /* ponechaj starú hodnotu */
    }
  }, [segment]);

  useEffect(() => {
    loadPendingAnalysis();
  }, [loadPendingAnalysis]);

  // Koľko leadov v segmente má skóre zo staršej verzie skórovania (tlačidlo
  // "Preanalyzovať staré" sa ukáže len keď je čo preanalyzovať).
  const loadStaleCount = useCallback(async () => {
    try {
      const j = await fetch(
        `/api/leads/reset-analysis?segment=${encodeURIComponent(segment)}`,
      ).then((r) => r.json());
      setStaleCount(j.stale ?? 0);
    } catch {
      /* ponechaj starú hodnotu */
    }
  }, [segment]);

  useEffect(() => {
    loadStaleCount();
  }, [loadStaleCount]);

  // Restore the segment filter from the URL (?segment=) so returning from a lead
  // detail lands back on the same segment.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("segment");
    if (s) setSegment(s);
  }, []);

  const loadSegments = useCallback(async () => {
    try {
      const j = await fetch("/api/leads/segments").then((r) => r.json());
      setSegments(j.segments ?? []);
    } catch {
      /* ponecháme staré segmenty */
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // Filter kvality webu sa týka len leadov, ktoré ešte nikto neoslovil — oslovené,
  // reagujúce a skryté leady sa vždy ukážu všetky.
  const qualityApplies = status === "new" || status === "all";

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/leads?segment=${encodeURIComponent(segment)}&status=${status}&region=${encodeURIComponent(region)}&quality=${qualityApplies ? quality : "all"}`,
      );
      const j = await res.json();
      setLeads(j.leads ?? []);
      setTotal(j.total ?? 0);
      setRegions(j.regions ?? []);
      setContactedCount(j.contactedCount ?? 0);
      setQualityCounts(j.qualityCounts ?? null);
    } catch {
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [segment, status, region, quality, qualityApplies]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Nahranie CSV z TrustedLeads → parsovanie na serveri → refresh + ponuka analýzy.
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // aby sa dal ten istý súbor vybrať znova
    if (!file) return;
    setImporting(true);
    const tid = toast.loading("Importujem…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/import-csv", {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "import_failed");
      toast.success(
        `✅ Importovaných ${j.imported} | ⏭ Preskočených ${j.skipped} | 🔄 Duplikátov ${j.duplicates}`,
        { id: tid, duration: 7000 },
      );
      await Promise.all([loadSegments(), loadLeads(), loadPendingAnalysis()]);
      if (j.imported > 0) setAnalyzeAsk(j.imported);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message !== "import_failed"
          ? `Import zlyhal: ${err.message}`
          : "Import zlyhal",
        { id: tid },
      );
    } finally {
      setImporting(false);
    }
  };

  // Po importe (alebo kedykoľvek): analyzuj weby po dávkach, kým nie je hotovo
  // (server volá enrichLead). Obmedzené na aktuálne zvolený segment — z dialógu
  // po importe (kde ešte nemusí byť segment vybraný) ide bez obmedzenia.
  const runAnalyze = (scopeToSegment = true) => {
    setAnalyzeAsk(null);
    const scope = scopeToSegment && segment !== "all" ? segment : "all";
    // Slučka beží v analysis-runner (prežije prechod na detail leadu); druhé
    // spustenie počas behu sa ignoruje. Progres ukazuje <AnalysisProgress>.
    if (!startAnalysis(scope)) toast("Analýza už beží.");
  };

  // Obnovenie všetkého, čo analýza mení (zoznam, počty segmentov, počítadlá) —
  // volá ho ukazovateľ progresu priebežne počas behu a po jeho skončení.
  const refreshAfterAnalysis = useCallback(() => {
    loadSegments();
    loadLeads();
    loadPendingAnalysis();
    loadStaleCount();
  }, [loadSegments, loadLeads, loadPendingAnalysis, loadStaleCount]);

  // Vynuluje lastScannedAt pre leady so skóre zo STARŠEJ verzie skórovania v
  // aktuálnom segmente a spustí analýzu odznova — po oprave skórovacej logiky
  // (kliknutie na "Prepočítať" v detaile leadu web nescanuje odznova, len
  // prepíše text z pôvodného skóre). Bezpečné kliknúť opakovane: leady už
  // preanalyzované novou verziou sa nedotknú.
  const reanalyzeOld = async () => {
    if (analyzing) {
      toast("Analýza už beží.");
      return;
    }
    const scopeLabel =
      segment === "all"
        ? "vo všetkých segmentoch"
        : `v segmente „${segments.find((s) => s.id === segment)?.name ?? ""}"`;
    if (
      !confirm(
        `Preanalyzovať ${staleCount} leadov so starým skóre ${scopeLabel}? Každý web sa preskenuje odznova (PageSpeed, screenshot, AI vizuál) — potrvá to. Staré skóre sa prepíše novým. Beh môžeš nechať bežať a prechádzať appku.`,
      )
    )
      return;
    try {
      const r = await fetch("/api/leads/reset-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: segment }),
      }).then((x) => x.json());
      toast.success(`Pripravených ${r.reset ?? 0} leadov na preanalyzovanie`);
      await Promise.all([loadPendingAnalysis(), loadStaleCount()]);
      runAnalyze(true);
    } catch {
      toast.error("Reset zlyhal");
    }
  };

  // Hromadné skrytie leadov s JEDNOZNAČNE dobrým webom (skóre pod BORDERLINE_AT)
  // v aktuálnom segmente. Vhodné ani hraničné leady sa nikdy neskryjú.
  const hideGoodWebs = async () => {
    const scope =
      segment === "all" ? "vo všetkých segmentoch" : "v tomto segmente";
    if (
      !confirm(
        `Skryť neoslovené leady s jednoznačne dobrým webom (skóre < ${BORDERLINE_AT}) ${scope}? Označia sa ako zamietnuté — zmiznú zo zoznamu, ale ostanú v databáze a dajú sa vrátiť. Vhodné a hraničné leady sa nedotknú.`,
      )
    )
      return;
    setHiding(true);
    const tid = toast.loading("Skrývam…");
    try {
      const res = await fetch("/api/leads/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, maxScore: BORDERLINE_AT }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error();
      toast.success(`✅ Skrytých ${j.rejected} leadov`, { id: tid });
      await Promise.all([loadSegments(), loadLeads()]);
    } catch {
      toast.error("Skrytie zlyhalo", { id: tid });
    } finally {
      setHiding(false);
    }
  };

  const totalLeads = useMemo(
    () => segments.reduce((a, s) => a + s.leadCount, 0),
    [segments],
  );

  const SegmentBtn = ({
    id,
    name,
    color,
    count,
    mobile,
  }: {
    id: string;
    name: string;
    color?: string;
    count: number;
    mobile?: boolean;
  }) => (
    <button
      onClick={() => setSegment(id)}
      className={cn(
        mobile
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
          : "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
        segment === id
          ? mobile
            ? "border-primary/40 bg-primary/10 text-primary"
            : "bg-primary/10 text-primary"
          : mobile
            ? "border-border bg-surface text-muted hover:text-foreground"
            : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {color ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
      ) : (
        <Target className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 truncate">{name}</span>
      <span className="text-xs text-muted">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leady</h1>
          <p className="text-sm text-muted">
            Firmy so zastaralými webmi, pripravené na oslovenie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing || analyzing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? "Importujem…" : "Importovať CSV"}
          </button>
          {pendingAnalysis > 0 && (
            <button
              onClick={() => runAnalyze(true)}
              disabled={analyzing || importing}
              title={
                segment === "all"
                  ? "Bez analýzy webu appka nevie, či je vhodný na oslovenie — kým lead nie je analyzovaný, kampaň mu negeneruje mail. Analyzuje naprieč všetkými segmentmi."
                  : `Bez analýzy webu appka nevie, či je vhodný na oslovenie. Analyzuje len zvolený segment „${segments.find((s) => s.id === segment)?.name ?? ""}" — prepni na „Všetky segmenty", ak chceš naraz viac.`
              }
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing
                ? "Analyzujem…"
                : `Analyzovať weby (${pendingAnalysis})`}
            </button>
          )}
          {staleCount > 0 && (
            <button
              onClick={reanalyzeOld}
              disabled={analyzing || importing}
              title="Leady, ktoré majú skóre spočítané staršou verziou skórovania (pred opravou PageSpeedu, screenshotu, prahu) — toto ich preanalyzuje odznova. Už preanalyzované leady sa nedotkne, takže je bezpečné kliknúť opakovane."
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
            >
              <RotateCw className="h-4 w-4" />
              {`Preanalyzovať staré (${staleCount})`}
            </button>
          )}
          <Link
            href="/leads/metriky"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            <BarChart3 className="h-4 w-4" />
            Metriky
          </Link>
          <Link
            href="/leads/kampane"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            <Mail className="h-4 w-4" />
            Kampane
          </Link>
          <Link
            href="/leads/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            <Settings className="h-4 w-4" />
            Nastavenia
          </Link>
        </div>
      </div>

      {/* Progres analýzy webov: X z Y hotových, zostáva Z (z DB, prežije návrat
          z detailu leadu aj reload). */}
      <AnalysisProgress segment={segment} onRefresh={refreshAfterAnalysis} />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Segment sidebar (desktop) */}
        <aside className="hidden space-y-1 lg:block">
          <SegmentBtn id="all" name="Všetky segmenty" count={totalLeads} />
          {segments.map((s) => (
            <SegmentBtn
              key={s.id}
              id={s.id}
              name={s.name}
              color={s.color}
              count={s.leadCount}
            />
          ))}
        </aside>

        <div className="min-w-0">
          {/* Segment chips (mobile) */}
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
            <SegmentBtn id="all" name="Všetky" count={totalLeads} mobile />
            {segments.map((s) => (
              <SegmentBtn
                key={s.id}
                id={s.id}
                name={s.name}
                color={s.color}
                count={s.leadCount}
                mobile
              />
            ))}
          </div>

          {/* Status filter + kraj */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setStatus(t.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                    status === t.value
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-9 w-[210px]">
                <SelectValue placeholder="Všetky kraje" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Všetky kraje ({regions.reduce((a, r) => a + r.count, 0)})
                </SelectItem>
                {regions
                  .filter((r) => r.region)
                  .map((r) => (
                    <SelectItem key={r.region} value={r.region as string}>
                      {r.region} ({r.count})
                    </SelectItem>
                  ))}
                {regions
                  .filter((r) => !r.region)
                  .map((r) => (
                    <SelectItem key="__none__" value="none">
                      Neznámy kraj ({r.count})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {region !== "all" && (
              <button
                onClick={() => setRegion("all")}
                className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                zrušiť filter
              </button>
            )}

            {/* Filter podľa kvality webu (skóre zastaralosti) — len pre neoslovených */}
            {qualityApplies && (
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="h-9 w-[270px]">
                  <SelectValue placeholder="Kvalita webu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bad">
                    Vhodné na oslovenie (≥ {QUALIFY_AT}){qualityCounts ? ` · ${qualityCounts.bad}` : ""}
                  </SelectItem>
                  <SelectItem value="borderline">
                    Hraničné - pozri ručne ({BORDERLINE_AT}–{QUALIFY_AT - 1}){qualityCounts ? ` · ${qualityCounts.borderline}` : ""}
                  </SelectItem>
                  <SelectItem value="unscored">
                    Bez skóre / nezanalyzované{qualityCounts ? ` · ${qualityCounts.unscored}` : ""}
                  </SelectItem>
                  <SelectItem value="good">
                    Web v poriadku (&lt; {BORDERLINE_AT}){qualityCounts ? ` · ${qualityCounts.good}` : ""}
                  </SelectItem>
                  <SelectItem value="all">Všetky weby</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Hromadné skrytie „dobrých webov" — len keď je na ne nastavený filter */}
            {quality === "good" && leads.length > 0 && (
              <button
                onClick={hideGoodWebs}
                disabled={hiding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
              >
                {hiding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                Skryť tieto ({leads.length})
              </button>
            )}
          </div>

          {!loading && (
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>
                Zobrazených{" "}
                <span className="text-foreground">{leads.length}</span> z{" "}
                {total} leadov
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1 text-success">
                <MailCheck className="h-3.5 w-3.5" />
                oslovených <span className="font-medium">
                  {contactedCount}
                </span>{" "}
                z {total}
              </span>
              {total > 0 && (
                <span className="text-muted">
                  ({Math.round((contactedCount / total) * 100)}%)
                </span>
              )}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Načítavam leady…
            </div>
          ) : leads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Target className="h-6 w-6" />
                </div>
                <p className="max-w-md text-sm text-muted">
                  Žiadne leady. Spusti scan segmentu v nastaveniach — nájdeme
                  firmy so zastaralými webmi.
                </p>
                <Link
                  href="/leads/settings"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  <Settings className="h-4 w-4" />
                  Spustiť scan
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}?segment=${encodeURIComponent(segment)}`}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-primary/40",
                    // Oslovené leady dostanú zelený ľavý pruh — v zmiešanom zozname
                    // hneď vidno, ktoré sú vybavené a ktoré ešte čakajú.
                    l.status !== "new"
                      ? "border-border border-l-2 border-l-success"
                      : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {l.companyName}
                      </p>
                      {l.websiteUrl && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                          <Globe className="h-3 w-3" />
                          {host(l.websiteUrl)}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                        scoreClasses(l.websiteScore),
                      )}
                      title="Skóre zastaralosti webu"
                    >
                      {l.websiteScore ?? "—"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-muted">
                    {l.ownerName && (
                      <p className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        {l.ownerName}
                        {l.ownerPosition ? ` · ${l.ownerPosition}` : ""}
                        {isVerifiedOwnerSource(l.ownerSource) ? (
                          <span
                            title={`Meno ${OWNER_SOURCE_LABEL[l.ownerSource]}`}
                            className="inline-flex text-success"
                          >
                            <ShieldCheck className="h-3 w-3" />
                          </span>
                        ) : (
                          <span
                            title="Meno nie je overené - v maile sa nepoužije, oslovenie bude „Dobrý deň,“"
                            className="text-[10px] text-warning"
                          >
                            neoverené
                          </span>
                        )}
                      </p>
                    )}
                    {l.companyPhone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        {l.companyPhone}
                      </p>
                    )}
                    {(l.companyCity || l.region) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {l.companyCity}
                        {l.region && (
                          <span className="text-muted/80">
                            {l.companyCity ? " · " : ""}
                            {l.region}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                      {l.websiteTechnology && (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {l.websiteTechnology}
                        </span>
                      )}
                      {l.pageSpeedMobile != null && (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          PS {l.pageSpeedMobile}
                        </span>
                      )}
                    </p>
                  </div>

                  {l.aiPainPoint && (
                    <p className="line-clamp-2 rounded-lg bg-surface-2/60 px-2.5 py-2 text-xs leading-relaxed text-muted">
                      {l.aiPainPoint}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {l.status === "new" ? (
                      <Badge variant="default">Neoslovený</Badge>
                    ) : (
                      <Badge variant="success">
                        <Check className="h-3 w-3" />
                        Oslovený
                        {l.contactedAt ? ` · ${shortDate(l.contactedAt)}` : ""}
                      </Badge>
                    )}
                    {/* Ďalší postup nad rámec „oslovený" zvýrazníme zvlášť. */}
                    {(l.status === "responded" || l.status === "converted") && (
                      <Badge variant={STATUS_VARIANT[l.status]}>
                        {LEAD_STATUS_LABEL[l.status]}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ponuka spustenia analýzy po úspešnom importe */}
      {analyzeAsk !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Importovaných {analyzeAsk} leadov
            </h2>
            <p className="mt-1 text-sm text-muted">
              Chcete spustiť automatickú analýzu webov? Ohodnotíme zastaralosť a
              pripravíme leady na oslovenie. Môže to chvíľu trvať.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setAnalyzeAsk(null)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Nie, neskôr
              </button>
              <button
                onClick={() => runAnalyze(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                Áno, analyzovať
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
