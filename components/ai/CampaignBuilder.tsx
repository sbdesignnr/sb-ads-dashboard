"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Sparkles,
  Wand2,
  Bot,
  ArrowLeft,
  ArrowRight,
  Check,
  ShoppingCart,
  UserPlus,
  Megaphone,
  MousePointerClick,
  Download,
  Copy,
  RefreshCw,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Markdown } from "./Markdown";
import { copyToClipboard, downloadFile } from "@/lib/export";
import { formatCurrency } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface WizardData {
  goal?: string;
  service?: string;
  audience?: string;
  budget?: number;
  duration?: string;
  platform?: string;
  url?: string;
  remarketing?: string;
  kpi?: string;
  usp?: string;
  tone?: string;
  creatives?: string;
  benefit1?: string;
  benefit2?: string;
  benefit3?: string;
  competitors?: string;
  differentiation?: string;
  competitorKeywords?: string;
}

const DEFAULT_DATA: WizardData = { budget: 500, platform: "both" };
const STEPS = ["Základné info", "Platforma a cieľ", "Kreatíva a messaging", "Konkurencia", "AI plán"];
const STORAGE_KEY = "sb-campaign-builder";

const GOALS = [
  { v: "sales", label: "Predaj produktu/služby", icon: ShoppingCart },
  { v: "leads", label: "Generovanie leadov", icon: UserPlus },
  { v: "awareness", label: "Brand awareness", icon: Megaphone },
  { v: "traffic", label: "Návštevnosť webu", icon: MousePointerClick },
];
const DURATIONS = [
  { v: "1week", label: "1 týždeň" },
  { v: "1month", label: "1 mesiac" },
  { v: "3months", label: "3 mesiace" },
  { v: "longterm", label: "Dlhodobo" },
];
const PLATFORMS = [
  { v: "google", label: "Google Search" },
  { v: "meta", label: "Meta (FB/IG)" },
  { v: "both", label: "Obe platformy" },
];
const REMARKETINGS = [
  { v: "none", label: "Nemám" },
  { v: "pixel", label: "Facebook Pixel" },
  { v: "tag", label: "Google Tag" },
  { v: "both", label: "Oboje" },
];
const KPIS = [
  { v: "roas", label: "ROAS" },
  { v: "leads", label: "Počet leadov" },
  { v: "cpa", label: "CPA" },
  { v: "traffic", label: "Návštevnosť" },
];
const TONES = [
  { v: "professional", label: "Profesionálny" },
  { v: "friendly", label: "Priateľský" },
  { v: "urgent", label: "Urgentný" },
  { v: "luxury", label: "Luxusný" },
];
const CREATIVES = [
  { v: "have", label: "Mám vlastné" },
  { v: "need", label: "Potrebujem odporúčania" },
];

const LABELS: Record<string, Record<string, string>> = {
  goal: Object.fromEntries(GOALS.map((o) => [o.v, o.label])),
  duration: Object.fromEntries(DURATIONS.map((o) => [o.v, o.label])),
  platform: Object.fromEntries(PLATFORMS.map((o) => [o.v, o.label])),
  remarketing: Object.fromEntries(REMARKETINGS.map((o) => [o.v, o.label])),
  kpi: Object.fromEntries(KPIS.map((o) => [o.v, o.label])),
  tone: Object.fromEntries(TONES.map((o) => [o.v, o.label])),
  creatives: Object.fromEntries(CREATIVES.map((o) => [o.v, o.label])),
};

function recommendPlatform(d: WizardData): { platform: string; reason: string } {
  const budget = d.budget ?? 500;
  let platform = "both";
  let reason: string;
  switch (d.goal) {
    case "awareness":
      platform = budget < 300 ? "meta" : "both";
      reason =
        "Pre brand awareness je Meta (Facebook/Instagram) najsilnejšia — vizuálny dosah a nízky CPM, najmä cez Reels.";
      break;
    case "leads":
      platform = "both";
      reason =
        "Pre leady kombinuj Google Search (zachytí aktívny dopyt) s Meta Lead Ads (instant forms) — najlepší pomer kvalita/cena.";
      break;
    case "sales":
      platform = budget < 300 ? "google" : "both";
      reason =
        "Pre predaj má Google Search najvyšší nákupný zámer; pri vyššom rozpočte pridaj Meta Advantage+ na škálovanie.";
      break;
    case "traffic":
      platform = "meta";
      reason = "Pre lacnú návštevnosť je Meta (najmä Reels) najvýhodnejšia vďaka nízkemu CPM.";
      break;
    default:
      reason = "Odporúčam kombináciu oboch platforiem pre maximálny dosah.";
  }
  if (budget < 200) reason += " Pri malom rozpočte sa zameraj na jednu platformu, nech ho nerozdrobíš.";
  return { platform, reason };
}

function summarize(d: WizardData): { label: string; value: string }[] {
  const get = (k: keyof typeof LABELS, v?: string) => (v ? LABELS[k][v] ?? v : "");
  const rows: { label: string; value: string }[] = [
    { label: "Cieľ", value: get("goal", d.goal) },
    { label: "Služba", value: d.service ?? "" },
    { label: "Cieľová skupina", value: d.audience ?? "" },
    { label: "Budget", value: d.budget ? `${d.budget} €/mes` : "" },
    { label: "Trvanie", value: get("duration", d.duration) },
    { label: "Platforma", value: get("platform", d.platform) },
    { label: "URL", value: d.url ?? "" },
    { label: "KPI", value: get("kpi", d.kpi) },
    { label: "USP", value: d.usp ?? "" },
    { label: "Tón", value: get("tone", d.tone) },
    { label: "Konkurenti", value: d.competitors ?? "" },
  ];
  return rows.filter((r) => r.value.trim().length > 0);
}

// --- small field primitives ---

function Field({
  label,
  hint,
  index,
  children,
}: {
  label: string;
  hint?: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.07, 0.5) }}
      className="space-y-2"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </motion.div>
  );
}

function OptionGrid({
  value,
  onChange,
  options,
  cols = "sm:grid-cols-2",
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: { v: string; label: string; icon?: typeof ShoppingCart }[];
  cols?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-2", cols)}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all cursor-pointer",
              active
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                : "border-border bg-surface-2/40 text-muted hover:border-primary/40 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{o.label}</span>
            {active && <Check className="h-4 w-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted/60 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        props.className,
      )}
    />
  );
}

function AIIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

export function CampaignBuilder() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const loadedRef = useRef(false);
  const platformTouched = useRef(false);

  const update = (partial: Partial<WizardData>) => setData((d) => ({ ...d, ...partial }));

  // Restore saved draft on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { data?: WizardData; step?: number };
        if (saved.data) setData({ ...DEFAULT_DATA, ...saved.data });
        if (typeof saved.step === "number") setStep(Math.min(saved.step, 3));
        if (saved.data?.platform) platformTouched.current = true;
      }
    } catch {
      /* ignore */
    }
    loadedRef.current = true;
  }, []);

  // Persist draft.
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step }));
    } catch {
      /* ignore */
    }
  }, [data, step]);

  const recommendation = recommendPlatform(data);

  // Pre-select recommended platform when first reaching step 2.
  useEffect(() => {
    if (step === 1 && !platformTouched.current) {
      setData((d) => ({ ...d, platform: recommendation.platform }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setPlan("");
    try {
      const res = await fetch("/api/ai/campaign-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setPlan(acc);
      }
    } catch {
      setPlan("⚠️ Generovanie plánu zlyhalo. Skús to prosím znova.");
      toast.error("Generovanie zlyhalo");
    } finally {
      setGenerating(false);
    }
  };

  const goToGenerate = () => {
    setStep(4);
    void generate();
  };

  const copyPlan = async () => {
    if (await copyToClipboard(plan)) toast.success("Plán skopírovaný do schránky");
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { generateCampaignPdf } = await import("./campaign-pdf");
      const dateLabel = new Date().toLocaleDateString("sk-SK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const blob = await generateCampaignPdf(
        plan,
        summarize(data),
        `Plán kampane — ${data.service?.slice(0, 40) || "nová kampaň"}`,
        dateLabel,
      );
      downloadFile("sb-campaign-builder-plan.pdf", blob, "application/pdf");
      toast.success("PDF stiahnuté");
    } catch {
      toast.error("Export PDF zlyhal");
    } finally {
      setPdfLoading(false);
    }
  };

  const reset = () => {
    setData(DEFAULT_DATA);
    setStep(0);
    setPlan("");
    platformTouched.current = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    toast("Wizard vynulovaný");
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header + progress */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Wand2 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Campaign Builder</p>
            <p className="text-xs text-muted">
              Krok {Math.min(step + 1, 5)}/5 · {STEPS[step]}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Step body */}
      <div className="max-h-[58vh] min-h-[360px] overflow-y-auto p-5">
        <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          {step === 0 && (
            <div className="space-y-5">
              <AIIntro>Poďme spolu postaviť dokonalú kampaň. Najprv pár základných otázok 👇</AIIntro>
              <Field label="Čo chceš dosiahnuť touto kampaňou?" index={0}>
                <OptionGrid value={data.goal} onChange={(v) => update({ goal: v })} options={GOALS} />
              </Field>
              <Field label="Aká je tvoja služba/produkt?" index={1}>
                <Area
                  value={data.service ?? ""}
                  onChange={(e) => update({ service: e.target.value })}
                  placeholder="napr. Tvorba moderných webstránok na Next.js pre malé a stredné firmy v Nitre"
                />
              </Field>
              <Field
                label="Kto je tvoja cieľová skupina?"
                hint="Vek, pohlavie, záujmy, lokalita"
                index={2}
              >
                <Area
                  value={data.audience ?? ""}
                  onChange={(e) => update({ audience: e.target.value })}
                  placeholder="napr. Majitelia malých firiem 28–55 r., Slovensko, záujem o online marketing a rast podnikania"
                />
              </Field>
              <Field label="Aký je tvoj mesačný budget?" index={3}>
                <div className="flex items-center gap-4">
                  <Slider
                    value={data.budget ?? 500}
                    min={50}
                    max={5000}
                    step={50}
                    onChange={(budget) => update({ budget })}
                    aria-label="Mesačný budget"
                  />
                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-gradient">
                    {formatCurrency(data.budget ?? 500, true)}
                  </span>
                </div>
              </Field>
              <Field label="Ako dlho chceš kampaň spúšťať?" index={4}>
                <OptionGrid
                  value={data.duration}
                  onChange={(v) => update({ duration: v })}
                  options={DURATIONS}
                  cols="sm:grid-cols-4"
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <AIIntro>
                Na základe tvojich odpovedí odporúčam{" "}
                <span className="font-semibold text-primary">
                  {LABELS.platform[recommendation.platform]}
                </span>
                . {recommendation.reason} Súhlasíš, alebo to upravíš?
              </AIIntro>
              <Field label="Platforma" index={0}>
                <OptionGrid
                  value={data.platform}
                  onChange={(v) => {
                    platformTouched.current = true;
                    update({ platform: v });
                  }}
                  options={PLATFORMS}
                  cols="sm:grid-cols-3"
                />
              </Field>
              <Field label="Aká je tvoja webstránka / landing page URL?" index={1}>
                <Input
                  value={data.url ?? ""}
                  onChange={(e) => update({ url: e.target.value })}
                  placeholder="https://sbdesign.sk"
                />
              </Field>
              <Field
                label="Máš existujúce remarketingové publikum?"
                hint="Facebook Pixel, Google Tag"
                index={2}
              >
                <OptionGrid
                  value={data.remarketing}
                  onChange={(v) => update({ remarketing: v })}
                  options={REMARKETINGS}
                  cols="sm:grid-cols-4"
                />
              </Field>
              <Field label="Aké sú tvoje KPI?" hint="Podľa čoho budeš merať úspech" index={3}>
                <OptionGrid
                  value={data.kpi}
                  onChange={(v) => update({ kpi: v })}
                  options={KPIS}
                  cols="sm:grid-cols-4"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <AIIntro>Super. Teraz k posolstvu a kreatíve — toto rozhoduje o úspechu reklám.</AIIntro>
              <Field
                label="Aká je tvoja hlavná USP (unique selling proposition)?"
                hint="Prečo si zákazník vyberie práve teba"
                index={0}
              >
                <Area
                  value={data.usp ?? ""}
                  onChange={(e) => update({ usp: e.target.value })}
                  placeholder="napr. Moderné, bleskovo rýchle weby na Next.js s osobným prístupom a fixnou cenou"
                />
              </Field>
              <Field label="Aký tón komunikácie preferuješ?" index={1}>
                <OptionGrid
                  value={data.tone}
                  onChange={(v) => update({ tone: v })}
                  options={TONES}
                  cols="sm:grid-cols-4"
                />
              </Field>
              <Field label="Máš existujúce obrázky/videá alebo potrebuješ odporúčania?" index={2}>
                <OptionGrid value={data.creatives} onChange={(v) => update({ creatives: v })} options={CREATIVES} />
              </Field>
              <Field label="Aké sú 3 hlavné benefity tvojej služby?" index={3}>
                <div className="space-y-2">
                  <Input
                    value={data.benefit1 ?? ""}
                    onChange={(e) => update({ benefit1: e.target.value })}
                    placeholder="1. benefit"
                  />
                  <Input
                    value={data.benefit2 ?? ""}
                    onChange={(e) => update({ benefit2: e.target.value })}
                    placeholder="2. benefit"
                  />
                  <Input
                    value={data.benefit3 ?? ""}
                    onChange={(e) => update({ benefit3: e.target.value })}
                    placeholder="3. benefit"
                  />
                </div>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <AIIntro>Posledná séria — konkurencia. Pomôže mi to s positioningom a kľúčovými slovami.</AIIntro>
              <Field label="Kto sú tvoji hlavní konkurenti?" index={0}>
                <Area
                  value={data.competitors ?? ""}
                  onChange={(e) => update({ competitors: e.target.value })}
                  placeholder="napr. Monkey Media, iFocus, UI42 …"
                />
              </Field>
              <Field label="Čím sa líšiš od konkurencie?" index={1}>
                <Area
                  value={data.differentiation ?? ""}
                  onChange={(e) => update({ differentiation: e.target.value })}
                  placeholder="napr. Rýchlosť Next.js, osobný prístup, transparentný cenník …"
                />
              </Field>
              <Field
                label="Aké kľúčové slová používa konkurencia?"
                hint="Ak vieš (nepovinné)"
                index={2}
              >
                <Area
                  value={data.competitorKeywords ?? ""}
                  onChange={(e) => update({ competitorKeywords: e.target.value })}
                  placeholder="napr. tvorba webu, web na mieru, digitálna agentúra …"
                />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Tvoj kompletný campaign setup
              </div>
              {/* summary chips */}
              <div className="flex flex-wrap gap-1.5">
                {summarize(data)
                  .slice(0, 6)
                  .map((s) => (
                    <span
                      key={s.label}
                      className="rounded-full border border-border bg-surface-2/50 px-2.5 py-0.5 text-xs text-muted"
                    >
                      <span className="text-foreground">{s.label}:</span> {s.value.slice(0, 28)}
                    </span>
                  ))}
              </div>

              {generating && plan.length === 0 ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  AI pripravuje tvoj plán kampane…
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface-2/20 p-4">
                  <Markdown>{plan}</Markdown>
                  {generating && (
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
        {step < 4 ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" />
              Späť
            </Button>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted sm:inline">Koncept sa ukladá automaticky</span>
              {step < 3 ? (
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  Pokračovať
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="gradient" size="sm" onClick={goToGenerate}>
                  <Wand2 className="h-4 w-4" />
                  Vygenerovať plán
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4" />
              Upraviť odpovede
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Generovať znova
              </Button>
              <Button variant="secondary" size="sm" onClick={copyPlan} disabled={generating || !plan}>
                <Copy className="h-4 w-4" />
                Začať implementáciu
              </Button>
              <Button variant="gradient" size="sm" onClick={downloadPdf} disabled={generating || !plan || pdfLoading}>
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Stiahnuť PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
