// Laboratórium agentov: týždenné zdokonaľovanie. (1) Kontrola noviniek z AI: oficiálny cenník a
// zoznam modelov Anthropicu sa porovná s tým, čo agenti používajú (zmena ceny, nový model), (2)
// týždenné hodnotenie práce: z verdiktov, spätnej väzby a výsledkov mailov vzniknú lekcie, ktoré
// sa vkladajú do promptov Mira a Nory. Nič sa nemení samo (modely a ceny len navrhne, schvaľuje človek).
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { createMessage, textFrom, WRITER_MODEL } from "@/lib/leads/ai";
import { AGENTS_START, listedPrice, withSpend } from "./budget";
import { SCOUT_MODEL } from "./assess";
import { listNotes, notesAvailable, writeNote } from "./notes";

const DOCS = "https://platform.claude.com/docs/en/about-claude";

export interface PriceDrift {
  model: string;
  ours: { input: number; output: number };
  listed: { input: number; output: number };
}

export interface NewsResult {
  baseline: boolean;
  priceDrift: PriceDrift[];
  newModels: string[];
  error?: string;
}

/** "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5" (názov v cenníku) */
export function docName(model: string): string {
  const parts = model.replace(/^claude-/, "").replace(/-\d{8}$/, "").split("-");
  const fam = parts[0] ?? model;
  return `${fam.charAt(0).toUpperCase()}${fam.slice(1)} ${parts.slice(1).join(".")}`.trim();
}

const fetchText = async (url: string) => {
  const r = await fetch(url, { headers: { "User-Agent": "SBDesignAgents/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
};

/** Z markdown tabuľky cenníka vytiahne (model -> vstup/výstup USD za 1 M tokenov). */
export function parsePricing(md: string): Map<string, { input: number; output: number }> {
  const out = new Map<string, { input: number; output: number }>();
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(Claude\s+[A-Za-z]+\s+[\d.]+)\b[^|]*\|(.*)$/);
    if (!m) continue;
    const nums = [...m[2].matchAll(/\$([\d.]+)\s*\/\s*MTok/g)].map((x) => Number(x[1]));
    if (nums.length < 2) continue;
    // platí prvý výskyt (hlavná tabuľka); ďalšie tabuľky (Batch, rýchly režim) majú tie isté názvy
    const name = m[1].replace(/^Claude\s+/, "").trim();
    if (!out.has(name)) out.set(name, { input: nums[0], output: nums[nums.length - 1] });
  }
  return out;
}

/** Modely, ktoré agenti reálne používajú. */
export function modelsInUse(): string[] {
  return [
    ...new Set([
      SCOUT_MODEL,
      WRITER_MODEL,
      process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5",
      process.env.ATELIER_PREMIUM_MODEL?.trim() || "claude-opus-5-5",
    ]),
  ];
}

export async function checkAiNews(): Promise<NewsResult> {
  const res: NewsResult = { baseline: false, priceDrift: [], newModels: [] };
  try {
    const [pricing, overview] = await Promise.all([fetchText(`${DOCS}/pricing.md`), fetchText(`${DOCS}/models/overview.md`)]);
    const listed = parsePricing(pricing);
    for (const model of modelsInUse()) {
      const l = listed.get(docName(model));
      if (!l) continue;
      const ours = listedPrice(model);
      if (Math.abs(l.input - ours.input) > 0.001 || Math.abs(l.output - ours.output) > 0.001) res.priceDrift.push({ model, ours, listed: l });
    }
    const ids = [...new Set([...overview.matchAll(/\bclaude-[a-z0-9]+(?:-[a-z0-9.]+)+/g)].map((x) => x[0]))];
    const prev = (await listNotes({ kind: "news" }, 1))[0];
    const prevModels = new Set(((prev?.data as { models?: string[] } | null)?.models ?? []) as string[]);
    if (prev) res.newModels = ids.filter((id) => !prevModels.has(id));
    else res.baseline = true;
    await writeNote({
      agent: "lab",
      kind: "news",
      title: res.priceDrift.length || res.newModels.length ? "Zmena v AI cenníku alebo modeloch" : "Kontrola noviniek z AI: bez zmien",
      body: [
        res.priceDrift.length ? `Cena sa líši od pokladnice: ${res.priceDrift.map((d) => `${d.model} (u nás ${d.ours.input}/${d.ours.output} $, cenník ${d.listed.input}/${d.listed.output} $)`).join("; ")}.` : "",
        res.newModels.length ? `Nové modely v dokumentácii: ${res.newModels.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      data: { models: ids, priceDrift: res.priceDrift, newModels: res.newModels, checkedModels: modelsInUse() },
    });
  } catch (e) {
    res.error = (e as Error).message.slice(0, 200);
  }
  return res;
}

const REVIEW_SYSTEM = `Si laboratórium štúdia SB Design: týždenne hodnotíš prácu agentov Mira (skaut, hľadá a posudzuje firmy) a Nory (výskum firiem, ponuky a maily) a z reálnych dát píšeš LEKCIE, ktoré sa vložia do ich promptov. Používaj IBA dáta zo zadania; ak je dát málo na záver, napíš to a nevymýšľaj trendy.

Výstup: JSON {"summary":"3 vety po slovensky pre majiteľa štúdia: čo fungovalo, čo nie, čo agenti zmenia","lessons":[{"for":"miro|nora|all","text":"jedna konkrétna veta v rozkaznom tvare, použiteľná v prompte (napr. 'Realitné kancelárie s webom na Webnode a rokom pod 2016 sú najčastejšie vhodné.')"}]}
Najviac 6 lekcií. Lekcia musí vychádzať z dát (verdikty, dôvody vyradenia, spätná väzba človeka, výsledky mailov), nie z všeobecných rád.`;

/** Týždenné hodnotenie: zo záznamov a výsledkov vzniknú lekcie a súhrn. */
export async function weeklyReview(): Promise<{ summary: string; lessons: number; skipped?: string }> {
  if (!(await notesAvailable())) return { summary: "", lessons: 0, skipped: "Chýba tabuľka agent_notes." };
  const since = new Date(Math.max(Date.now() - 7 * 86_400_000, AGENTS_START.getTime()));
  const [verdicts, feedback, scans, research, mails] = await Promise.all([
    listNotes({ kind: "verdict", since }, 500),
    listNotes({ kind: "feedback", since }, 60),
    listNotes({ kind: "scan", since }, 60),
    prisma.leadResearch.findMany({ where: { createdAt: { gte: since } }, select: { status: true, error: true, offerName: true, appliedAt: true } }),
    prisma.leadEmail.findMany({
      where: { emailType: "initial", sentAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      select: { openedAt: true, repliedAt: true, lead: { select: { segment: { select: { name: true } } } } },
    }),
  ]);
  let okCount = 0;
  let noCount = 0;
  const rejectReasons = new Map<string, number>();
  for (const v of verdicts) {
    const d = (v.data ?? {}) as { suitable?: boolean; rejectReason?: string | null };
    if (d.suitable) okCount++;
    else {
      noCount++;
      const r = (d.rejectReason ?? "").slice(0, 90);
      if (r) rejectReasons.set(r, (rejectReasons.get(r) ?? 0) + 1);
    }
  }
  const mailBySeg = new Map<string, { sent: number; opened: number; replied: number }>();
  for (const m of mails) {
    const k = m.lead.segment?.name ?? "?";
    const cur = mailBySeg.get(k) ?? { sent: 0, opened: 0, replied: 0 };
    cur.sent++;
    if (m.openedAt) cur.opened++;
    if (m.repliedAt) cur.replied++;
    mailBySeg.set(k, cur);
  }
  const data = [
    `VERDIKTY MIRA (7 dní): vhodných ${okCount}, nevhodných ${noCount}`,
    `NAJČASTEJŠIE DÔVODY VYRADENIA:\n${[...rejectReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, n]) => `- ${n}× ${r}`).join("\n") || "- (žiadne)"}`,
    `SKENY: ${scans.length}, nájdených firiem ${scans.reduce((a, n) => a + (((n.data as { found?: number } | null)?.found) ?? 0), 0)}`,
    `NORA (7 dní): hotových ${research.filter((r) => r.status === "done").length}, zlyhaných/vyradených ${research.filter((r) => r.status === "failed").length}; použitých ako koncept ${research.filter((r) => r.appliedAt).length}`,
    `DÔVODY ZLYHANIA NORY: ${research.filter((r) => r.error).slice(0, 6).map((r) => (r.error ?? "").slice(0, 90)).join(" | ") || "—"}`,
    `SPÄTNÁ VÄZBA ČLOVEKA A NORY:\n${feedback.slice(0, 20).map((f) => `- (${f.agent}) ${f.title ?? ""}${f.body ? `: ${f.body}` : ""}`).join("\n") || "- (žiadna)"}`,
    `VÝSLEDKY MAILOV (30 dní, podľa odboru): ${[...mailBySeg.entries()].map(([k, v]) => `${k}: ${v.sent} odoslaných, ${v.opened} otvorených, ${v.replied} odpovedí`).join("; ") || "—"}`,
  ].join("\n\n");
  return withSpend({ agent: "skaut" }, async () => {
    const msg = await createMessage(new Anthropic(), {
      model: process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5",
      max_tokens: 1500,
      temperature: 0.3,
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: data }],
    });
    const m = textFrom(msg).match(/\{[\s\S]*\}/);
    if (!m) return { summary: "", lessons: 0, skipped: "Model nevrátil JSON." };
    let j: { summary?: string; lessons?: { for?: string; text?: string }[] };
    try {
      j = JSON.parse(m[0]);
    } catch {
      return { summary: "", lessons: 0, skipped: "Neplatný JSON od modelu." };
    }
    const summary = String(j.summary ?? "").slice(0, 700);
    await writeNote({ agent: "lab", kind: "lesson", title: "Týždenný súhrn", body: summary, data: { for: "none", summary: true } });
    let n = 0;
    for (const l of (j.lessons ?? []).slice(0, 6)) {
      const text = String(l.text ?? "").trim();
      if (!text) continue;
      await writeNote({ agent: "lab", kind: "lesson", title: "Lekcia", body: text.slice(0, 300), data: { for: ["miro", "nora"].includes(String(l.for)) ? l.for : "all" } });
      n++;
    }
    return { summary, lessons: n };
  });
}
