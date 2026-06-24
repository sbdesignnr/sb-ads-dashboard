import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_SYSTEM_PROMPT, BLOG_TOPIC_POOL } from "./constants";
import type {
  CompetitorAnalysis,
  PricingTier,
  ScanChange,
  ScrapedData,
  ThreatLevel,
} from "./types";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function maxPrice(pricing: string[]): number | null {
  let max: number | null = null;
  for (const p of pricing) {
    const digits = p.replace(/[^\d]/g, "");
    if (!digits) continue;
    const value = Number(digits);
    if (Number.isFinite(value) && (max === null || value > max)) max = value;
  }
  return max;
}

function inferPositioning(scraped: ScrapedData): PricingTier {
  const max = maxPrice(scraped.pricing);
  if (max !== null) {
    if (max >= 4000) return "premium";
    if (max >= 1500) return "mid";
    return "budget";
  }
  // No visible pricing — guess from breadth of services / tech.
  if (scraped.techStack.includes("Next.js") || scraped.services.length >= 6) return "premium";
  if (scraped.services.length >= 3) return "mid";
  return "unknown";
}

const POSITIONING_LABEL: Record<PricingTier, string> = {
  premium: "Premium",
  mid: "Stredná trieda",
  budget: "Budget",
  unknown: "Neznáme",
};

function composeFullText(a: {
  summary: string;
  positioning: PricingTier;
  threatLevel: ThreatLevel;
  strengths: string[];
  weaknesses: string[];
  actions: string[];
  blogSuggestion: string;
  priceNote?: string;
}): string {
  const threatWord = a.threatLevel === "high" ? "Vysoká" : a.threatLevel === "medium" ? "Stredná" : "Nízka";
  return [
    `## Zhrnutie`,
    a.summary,
    ``,
    `## Cenové pozicionovanie`,
    `Odhadované: **${POSITIONING_LABEL[a.positioning]}**${a.priceNote ?? ""}.`,
    ``,
    `## Silné stránky`,
    ...a.strengths.map((s) => `- ${s}`),
    ``,
    `## Slabé stránky / medzery`,
    ...a.weaknesses.map((s) => `- ${s}`),
    ``,
    `## Čo môže SB Design urobiť lepšie`,
    ...a.actions.map((s) => `- ${s}`),
    ``,
    `## Odporúčaný blog článok`,
    `**${a.blogSuggestion}**`,
    ``,
    `## Hodnotenie hrozby: ${threatWord}`,
  ].join("\n");
}

function inferThreat(scraped: ScrapedData): ThreatLevel {
  if (!scraped.ok) return "low";
  let score = 0;
  score += Math.min(scraped.services.length, 6); // up to 6
  score += Math.min(scraped.blogPosts.length, 5); // up to 5
  if (scraped.techStack.includes("Next.js") || scraped.techStack.includes("React")) score += 3;
  else if (scraped.techStack.includes("WordPress")) score += 1;
  if (scraped.pricing.length > 0) score += 2;
  if (scraped.metaDescription) score += 1;

  if (score >= 12) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function buildHeuristicStrengths(scraped: ScrapedData): string[] {
  const out: string[] = [];
  if (scraped.blogPosts.length >= 1)
    out.push(`Aktívny blog (${scraped.blogPosts.length} článkov) — buduje SEO a autoritu`);
  if (scraped.techStack.includes("Next.js") || scraped.techStack.includes("React"))
    out.push("Moderný tech stack (React/Next.js) — rýchle weby");
  if (scraped.services.length >= 5)
    out.push(`Široké portfólio služieb (${scraped.services.length}) — pokrýva celý lievik`);
  if (scraped.pricing.length > 0) out.push("Transparentne uvedené ceny — znižuje bariéru dopytu");
  if (scraped.contact.phones.length > 0) out.push("Viditeľný kontakt — dobrá dôveryhodnosť");
  if (out.length < 3) out.push("Etablovaná prítomnosť na trhu");
  return out.slice(0, 3);
}

function buildHeuristicWeaknesses(scraped: ScrapedData): string[] {
  const out: string[] = [];
  if (scraped.blogPosts.length === 0) out.push("Žiadny viditeľný blog — slabší obsahový marketing a SEO");
  if (scraped.techStack.includes("WordPress") && !scraped.techStack.includes("Next.js"))
    out.push("Staršie technológie (WordPress) — potenciálne pomalšie weby");
  if (scraped.pricing.length === 0) out.push("Netransparentné ceny — vyššia bariéra pre dopyt");
  if (scraped.services.length < 3) out.push("Úzke portfólio služieb — obmedzený cross-sell");
  if (!scraped.metaDescription) out.push("Chýbajúci/slabý meta popis — slabšie SEO základy");
  if (out.length < 3) out.push("Priestor na zlepšenie konverznej optimalizácie");
  return out.slice(0, 3);
}

function buildHeuristicActions(scraped: ScrapedData): string[] {
  const out: string[] = [];
  if (scraped.techStack.includes("WordPress") && !scraped.techStack.includes("Next.js"))
    out.push("Zdôrazni rýchlosť a Core Web Vitals Next.js webov oproti ich WordPressu");
  if (scraped.pricing.length === 0)
    out.push("Ponúkni transparentný cenník (Starter/Business/Premium) — odlíš sa od ich netransparentnosti");
  if (scraped.blogPosts.length === 0)
    out.push("Buduj obsah a lokálne SEO (Nitra) — preber organický traffic, ktorý nepokrývajú");
  while (out.length < 3) {
    const extras = [
      "Vyzdvihni osobný prístup a priame jednanie oproti veľkým agentúram",
      "Priprav prípadové štúdie s nameranými výsledkami (ROAS, rýchlosť)",
      "Nasaď remarketing na ich značkové výrazy v Google/Meta Ads",
    ];
    out.push(extras[out.length % extras.length]);
  }
  return out.slice(0, 3);
}

function pickBlogSuggestion(scraped: ScrapedData): string {
  // Prefer a topic that addresses a visible gap; deterministic per competitor.
  if (scraped.pricing.length === 0) return BLOG_TOPIC_POOL[0].title;
  if (scraped.techStack.includes("WordPress") && !scraped.techStack.includes("Next.js"))
    return BLOG_TOPIC_POOL[1].title;
  if (scraped.blogPosts.length === 0) return BLOG_TOPIC_POOL[2].title;
  const idx = hashString(scraped.url) % BLOG_TOPIC_POOL.length;
  return BLOG_TOPIC_POOL[idx].title;
}

function buildHeuristicAnalysis(scraped: ScrapedData): CompetitorAnalysis {
  const positioning = inferPositioning(scraped);
  const threatLevel = inferThreat(scraped);
  const strengths = buildHeuristicStrengths(scraped);
  const weaknesses = buildHeuristicWeaknesses(scraped);
  const actions = buildHeuristicActions(scraped);
  const blogSuggestion = pickBlogSuggestion(scraped);

  const summary = scraped.ok
    ? `Konkurent ponúka ${scraped.services.length ? scraped.services.join(", ") : "služby v oblasti webu a marketingu"}. ` +
      `Cenové pozicionovanie: ${POSITIONING_LABEL[positioning]}. ${
        scraped.techStack.length ? `Technológie: ${scraped.techStack.join(", ")}.` : ""
      }`
    : `Web sa nepodarilo načítať (${scraped.error ?? "neznáma chyba"}). Analýza je obmedzená.`;

  const priceNote = maxPrice(scraped.pricing)
    ? ` (najvyššia viditeľná cena ~${maxPrice(scraped.pricing)} €)`
    : " (ceny nie sú verejne uvedené)";
  const fullText = composeFullText({
    summary,
    positioning,
    threatLevel,
    strengths,
    weaknesses,
    actions,
    blogSuggestion,
    priceNote,
  });

  return {
    summary,
    pricingPositioning: positioning,
    threatLevel,
    strengths,
    weaknesses,
    actions,
    blogSuggestion,
    warnings: scraped.ok ? [] : [`Web ${scraped.url} sa nepodarilo načítať pri skene.`],
    fullText,
    source: "heuristic",
  };
}

function normalizeThreat(value: unknown): ThreatLevel {
  const s = String(value ?? "").toLowerCase();
  if (s.includes("vysok") || s === "high") return "high";
  if (s.includes("stred") || s === "medium") return "medium";
  return "low";
}

function normalizePositioning(value: unknown): PricingTier {
  const s = String(value ?? "").toLowerCase();
  if (s.includes("prem")) return "premium";
  if (s.includes("budget") || s.includes("nízk") || s.includes("lacn")) return "budget";
  if (s.includes("mid") || s.includes("stred")) return "mid";
  return "unknown";
}

async function tryClaudeAnalysis(scraped: ScrapedData): Promise<CompetitorAnalysis | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic();
  const userPrompt =
    `Naskenované dáta konkurenta (JSON):\n\`\`\`json\n${JSON.stringify(
      {
        url: scraped.url,
        title: scraped.title,
        metaDescription: scraped.metaDescription,
        headings: scraped.headings,
        services: scraped.services,
        pricing: scraped.pricing,
        blogPosts: scraped.blogPosts,
        techStack: scraped.techStack,
        contact: scraped.contact,
        ukazkaTextu: scraped.rawContent.slice(0, 1500),
      },
      null,
      2,
    )}\n\`\`\`\n\n` +
    `Vráť VÝHRADNE čistý JSON objekt (bez markdown fences) s týmito poľami:\n` +
    `- summary: string (2-3 vety)\n` +
    `- pricingPositioning: "premium" | "mid" | "budget"\n` +
    `- threatLevel: "low" | "medium" | "high"\n` +
    `- strengths: pole 3 stringov\n` +
    `- weaknesses: pole 3 stringov\n` +
    `- actions: pole 3 stringov (čo SB Design môže urobiť lepšie)\n` +
    `- blogSuggestion: string (1 konkrétny názov článku)\n` +
    `- warnings: pole stringov (na čo si dať pozor, môže byť prázdne)\n\n` +
    `Buď stručný — krátke vety, žiadny text mimo JSON.`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1600,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 5) : [];

    const summary = String(parsed.summary ?? "");
    const positioning = normalizePositioning(parsed.pricingPositioning);
    const threatLevel = normalizeThreat(parsed.threatLevel);
    const strengths = arr(parsed.strengths);
    const weaknesses = arr(parsed.weaknesses);
    const actions = arr(parsed.actions);
    const blogSuggestion = String(parsed.blogSuggestion ?? "");

    return {
      summary,
      pricingPositioning: positioning,
      threatLevel,
      strengths,
      weaknesses,
      actions,
      blogSuggestion,
      warnings: arr(parsed.warnings),
      fullText: composeFullText({ summary, positioning, threatLevel, strengths, weaknesses, actions, blogSuggestion }),
      source: "claude",
    };
  } catch (err) {
    console.warn(`[competitors] Claude analysis failed, using heuristic: ${(err as Error).message}`);
    return null;
  }
}

/** Analyze a competitor; uses Claude when available, falls back to a heuristic. */
export async function analyzeCompetitor(scraped: ScrapedData): Promise<CompetitorAnalysis> {
  const fromClaude = await tryClaudeAnalysis(scraped);
  if (fromClaude && fromClaude.strengths.length) return fromClaude;
  return buildHeuristicAnalysis(scraped);
}

/** Diff the current scrape against the previous one. */
export function detectChanges(
  current: ScrapedData,
  previous?: {
    services?: string[];
    pricing?: string[];
    blogPosts?: { title: string }[];
    techStack?: string[];
  } | null,
): ScanChange[] {
  if (!previous) return [];
  const changes: ScanChange[] = [];

  const diff = (cur: string[], prev: string[], type: ScanChange["type"], noun: string) => {
    const prevSet = new Set(prev);
    const curSet = new Set(cur);
    for (const item of cur) {
      if (!prevSet.has(item)) changes.push({ type, direction: "added", label: `Pridané: ${noun} „${item}"` });
    }
    for (const item of prev) {
      if (!curSet.has(item)) changes.push({ type, direction: "removed", label: `Odstránené: ${noun} „${item}"` });
    }
  };

  diff(current.services, previous.services ?? [], "service", "služba");
  diff(current.techStack, previous.techStack ?? [], "tech", "technológia");

  const prevTitles = new Set((previous.blogPosts ?? []).map((b) => b.title));
  for (const post of current.blogPosts) {
    if (!prevTitles.has(post.title)) {
      changes.push({ type: "blog", direction: "added", label: `Nový článok: „${post.title}"`, detail: post.date });
    }
  }

  const prevPricing = (previous.pricing ?? []).join("|");
  const curPricing = current.pricing.join("|");
  if (prevPricing !== curPricing && (prevPricing || curPricing)) {
    changes.push({ type: "pricing", direction: "changed", label: "Zmena viditeľných cien" });
  }

  return changes;
}
