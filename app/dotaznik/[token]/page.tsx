"use client";

import { use, useEffect, useState } from "react";
import { Loader2, Check, PartyPopper } from "lucide-react";

// ── Možnosti ──────────────────────────────────────────────────────────────────
const OPT = {
  websiteGoal: [
    ["leads", "Získavať dopyty / klientov"],
    ["eshop", "Predávať online (e-shop)"],
    ["trust", "Budovať dôveru a značku"],
    ["info", "Informovať o firme/službách"],
    ["other", "Iné"],
  ],
  hasPhotos: [
    ["yes", "Áno, mám vlastné"],
    ["no_need_shoot", "Nie, treba fotenie"],
    ["stock", "Použiť stock fotky"],
  ],
  hasTexts: [
    ["yes", "Áno, mám pripravené"],
    ["no_client", "Nie, dodám neskôr"],
    ["need_help", "Potrebujem pomoc s textami"],
  ],
  cmsNeeded: [
    ["full", "Áno, chcem si všetko spravovať sám"],
    ["partial", "Čiastočne (napr. blog, referencie)"],
    ["none", "Nie, netreba"],
  ],
  bookingNeeded: [
    ["none", "Netreba"],
    ["form", "Stačí formulár na dopyt"],
    ["full", "Plný rezervačný systém"],
    ["payment", "Rezervácie s platbou"],
    ["reminders", "Rezervácie s pripomienkami"],
  ],
  maintenanceInterest: [
    ["none", "Nie"],
    ["basic", "Základná (aktualizácie, zálohy)"],
    ["advanced", "Rozšírená (zmeny, podpora)"],
    ["later", "Zatiaľ neviem, neskôr"],
  ],
  seoInterest: [
    ["none", "Nie"],
    ["basic", "Základné SEO na štart"],
    ["ongoing", "Priebežná SEO optimalizácia"],
    ["info", "Chcem viac info"],
  ],
  adsInterest: [
    ["none", "Nie"],
    ["google", "Google Ads"],
    ["meta", "Meta (FB/IG) reklama"],
    ["both", "Oboje"],
    ["info", "Chcem viac info"],
  ],
} as const;

const SECTIONS_OPTS = [
  "Domov",
  "O nás",
  "Služby / Produkty",
  "Referencie / Portfólio",
  "Cenník",
  "Blog",
  "FAQ",
  "Kontakt",
  "Rezervácia",
];
const FEATURES_OPTS = [
  "Rezervačný systém",
  "Online platby",
  "Newsletter",
  "Blog",
  "Vyhľadávanie",
  "Filtre produktov",
  "Používateľské účty",
  "Live chat",
  "Mapa",
  "Galéria / Portfólio",
];
const INTEGRATIONS_OPTS = [
  "Google Analytics",
  "Facebook Pixel",
  "Mailchimp / newsletter",
  "CRM systém",
  "Rezervačný nástroj",
  "Platobná brána",
  "Sklad / ERP",
];
const LANG_OPTS = [
  ["sk", "Slovenčina"],
  ["cz", "Čeština"],
  ["en", "Angličtina"],
];

type Form = Record<string, string | string[] | boolean | null>;

// ── Prvky formulára ───────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
    />
  );
}

function Radio({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map(([v, l]) => (
        <label
          key={v}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            value === v
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          <input
            type="radio"
            checked={value === v}
            onChange={() => onChange(v)}
            className="accent-primary"
          />
          {l}
        </label>
      ))}
    </div>
  );
}

function Checks({
  options,
  values,
  onToggle,
}: {
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {on && "✓ "}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function QuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [meta, setMeta] = useState<{ name: string; company: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Form>({
    brandWords: ["", "", ""],
    inspirationUrls: [],
    antiInspirationUrls: [],
    requiredSections: [],
    specialFeatures: [],
    languages: ["sk"],
    externalIntegrations: [],
    hasLogo: null,
    primaryColor: "#4A90D9",
    secondaryColor: "#111827",
  });

  const set = (k: string, v: Form[string]) => setF((p) => ({ ...p, [k]: v }));
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  const arr = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : []);
  const toggle = (k: string, v: string) =>
    set(k, arr(k).includes(v) ? arr(k).filter((x) => x !== v) : [...arr(k), v]);

  useEffect(() => {
    fetch(`/api/public/questionnaire/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setMeta(j.project);
        if (j.completed) setDone(true);
        const q = j.questionnaire ?? {};
        setF((p) => ({
          ...p,
          ...Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)),
          brandWords: [...(q.brandWords ?? []), "", "", ""].slice(0, 3),
          inspirationUrls: q.inspirationUrls ?? [],
          antiInspirationUrls: q.antiInspirationUrls ?? [],
          requiredSections: q.requiredSections ?? [],
          specialFeatures: q.specialFeatures ?? [],
          languages: q.languages?.length ? q.languages : ["sk"],
          externalIntegrations: q.externalIntegrations ?? [],
          primaryColor: q.primaryColor ?? "#4A90D9",
          secondaryColor: q.secondaryColor ?? "#111827",
        }));
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (final: boolean) => {
    setSaving(true);
    try {
      const payload = {
        ...f,
        brandWords: arr("brandWords").filter(Boolean),
        submit: final,
      };
      const r = await fetch(`/api/public/questionnaire/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      if (final) setDone(true);
      else {
        const { default: toast } = await import("react-hot-toast");
        toast.success("Uložené — môžete pokračovať neskôr.");
      }
    } catch {
      const { default: toast } = await import("react-hot-toast");
      toast.error("Uloženie zlyhalo, skúste znova.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }
  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-center text-muted">
          Dotazník sa nenašiel alebo je link neplatný.
        </p>
      </main>
    );
  }
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <PartyPopper className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Ďakujeme!
          </h1>
          <p className="mt-2 text-sm text-muted">
            Dotazník je vyplnený. Ozvem sa Vám s ďalšími krokmi. — Samuel, SB
            Design
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-primary">SB Design</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Dotazník k projektu
          </h1>
          {meta && (
            <p className="mt-1 text-sm text-muted">
              {meta.company} · {meta.name}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            Vyplňte prosím čo najviac — čím viac viem, tým lepší web pripravím.
          </p>
        </div>

        <SectionCard n={1} title="O biznise">
          <Field label="Čím sa Vaša firma zaoberá?">
            <TextArea
              value={str("businessDescription")}
              onChange={(v) => set("businessDescription", v)}
              placeholder="Stručne opíšte, čo robíte…"
            />
          </Field>
          <Field label="Kto je Váš ideálny zákazník?">
            <TextArea
              value={str("idealCustomer")}
              onChange={(v) => set("idealCustomer", v)}
              placeholder="Vek, potreby, prečo si vyberá práve Vás…"
            />
          </Field>
          <Field label="Čím ste jedineční oproti konkurencii?">
            <TextArea
              value={str("uniqueValue")}
              onChange={(v) => set("uniqueValue", v)}
            />
          </Field>
          <Field label="Hlavný cieľ nového webu">
            <Radio
              options={OPT.websiteGoal}
              value={str("websiteGoal") || null}
              onChange={(v) => set("websiteGoal", v)}
            />
          </Field>
        </SectionCard>

        <SectionCard n={2} title="Dizajn">
          <Field
            label="Značka v 3 slovách"
            hint="Ako má web pôsobiť? (napr. moderný, dôveryhodný, hravý)"
          >
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <TextInput
                  key={i}
                  value={arr("brandWords")[i] ?? ""}
                  onChange={(v) => {
                    const next = [...arr("brandWords")];
                    next[i] = v;
                    set("brandWords", next);
                  }}
                  placeholder={`slovo ${i + 1}`}
                />
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hlavná farba">
              <input
                type="color"
                value={str("primaryColor") || "#4A90D9"}
                onChange={(e) => set("primaryColor", e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2"
              />
            </Field>
            <Field label="Doplnková farba">
              <input
                type="color"
                value={str("secondaryColor") || "#111827"}
                onChange={(e) => set("secondaryColor", e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface-2"
              />
            </Field>
          </div>
          <Field label="Weby, ktoré sa Vám páčia" hint="Jeden odkaz na riadok">
            <TextArea
              value={arr("inspirationUrls").join("\n")}
              onChange={(v) =>
                set(
                  "inspirationUrls",
                  v
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              placeholder="https://…"
            />
          </Field>
          <Field
            label="Weby, ktoré sa Vám nepáčia"
            hint="Jeden odkaz na riadok (nepovinné)"
          >
            <TextArea
              value={arr("antiInspirationUrls").join("\n")}
              onChange={(v) =>
                set(
                  "antiInspirationUrls",
                  v
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              placeholder="https://…"
            />
          </Field>
        </SectionCard>

        <SectionCard n={3} title="Obsah">
          <Field label="Máte logo?">
            <Radio
              options={
                [
                  ["true", "Áno, mám"],
                  ["false", "Nie, treba vytvoriť"],
                ] as const
              }
              value={f.hasLogo == null ? null : String(f.hasLogo)}
              onChange={(v) => set("hasLogo", v === "true")}
            />
          </Field>
          <Field label="Fotky">
            <Radio
              options={OPT.hasPhotos}
              value={str("hasPhotos") || null}
              onChange={(v) => set("hasPhotos", v)}
            />
          </Field>
          <Field label="Texty na web">
            <Radio
              options={OPT.hasTexts}
              value={str("hasTexts") || null}
              onChange={(v) => set("hasTexts", v)}
            />
          </Field>
          <Field label="Aké sekcie má web obsahovať?">
            <Checks
              options={SECTIONS_OPTS}
              values={arr("requiredSections")}
              onToggle={(v) => toggle("requiredSections", v)}
            />
          </Field>
        </SectionCard>

        <SectionCard n={4} title="Funkcie">
          <Field label="Špeciálne funkcie">
            <Checks
              options={FEATURES_OPTS}
              values={arr("specialFeatures")}
              onToggle={(v) => toggle("specialFeatures", v)}
            />
          </Field>
          <Field label="Jazykové verzie">
            <Checks
              options={LANG_OPTS.map(([, l]) => l)}
              values={arr("languages").map(
                (c) => LANG_OPTS.find(([v]) => v === c)?.[1] ?? c,
              )}
              onToggle={(label) => {
                const code =
                  LANG_OPTS.find(([, l]) => l === label)?.[0] ?? label;
                toggle("languages", code);
              }}
            />
          </Field>
          <Field label="Chcete si obsah spravovať sami (CMS)?">
            <Radio
              options={OPT.cmsNeeded}
              value={str("cmsNeeded") || null}
              onChange={(v) => set("cmsNeeded", v)}
            />
          </Field>
          <Field label="Integrácie s externými nástrojmi">
            <Checks
              options={INTEGRATIONS_OPTS}
              values={arr("externalIntegrations")}
              onToggle={(v) => toggle("externalIntegrations", v)}
            />
          </Field>
          <Field label="Špeciálne požiadavky">
            <TextArea
              value={str("specialRequirements")}
              onChange={(v) => set("specialRequirements", v)}
              placeholder="Čokoľvek špecifické, čo web musí vedieť…"
            />
          </Field>
        </SectionCard>

        <SectionCard n={5} title="Rezervácie">
          <Field label="Potrebujete rezervačný systém?">
            <Radio
              options={OPT.bookingNeeded}
              value={str("bookingNeeded") || null}
              onChange={(v) => set("bookingNeeded", v)}
            />
          </Field>
          <Field label="Ako to riešite teraz?" hint="Nepovinné">
            <TextArea
              value={str("bookingCurrentProcess")}
              onChange={(v) => set("bookingCurrentProcess", v)}
              rows={2}
            />
          </Field>
        </SectionCard>

        <SectionCard n={6} title="Projekt">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rozpočet">
              <TextInput
                value={str("budget")}
                onChange={(v) => set("budget", v)}
                placeholder="napr. 1500 - 2500 €"
              />
            </Field>
            <Field label="Želaný termín">
              <TextInput
                value={str("deadline")}
                onChange={(v) => set("deadline", v)}
                placeholder="napr. do 2 mesiacov"
              />
            </Field>
          </div>
          <Field label="Čokoľvek ďalšie, čo by som mal vedieť">
            <TextArea
              value={str("additionalInfo")}
              onChange={(v) => set("additionalInfo", v)}
            />
          </Field>
        </SectionCard>

        <SectionCard n={7} title="Po spustení (nezáväzné)">
          <Field label="Údržba webu">
            <Radio
              options={OPT.maintenanceInterest}
              value={str("maintenanceInterest") || null}
              onChange={(v) => set("maintenanceInterest", v)}
            />
          </Field>
          <Field label="SEO (aby Vás našli v Google)">
            <Radio
              options={OPT.seoInterest}
              value={str("seoInterest") || null}
              onChange={(v) => set("seoInterest", v)}
            />
          </Field>
          <Field label="Platená reklama">
            <Radio
              options={OPT.adsInterest}
              value={str("adsInterest") || null}
              onChange={(v) => set("adsInterest", v)}
            />
          </Field>
          {["google", "meta", "both"].includes(str("adsInterest")) && (
            <Field label="Predstava mesačného rozpočtu na reklamu">
              <TextInput
                value={str("monthlyAdsBudget")}
                onChange={(v) => set("monthlyAdsBudget", v)}
                placeholder="napr. 300 € / mesiac"
              />
            </Field>
          )}
        </SectionCard>

        <div className="sticky bottom-3 flex flex-col gap-2 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
          <button
            onClick={() => submit(false)}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            Uložiť a pokračovať neskôr
          </button>
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Odoslať dotazník
          </button>
        </div>
      </div>
    </main>
  );
}
