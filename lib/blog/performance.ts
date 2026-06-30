import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getArticlePerformance, ga4Configured } from "./ga4";

export interface ArticleRanked {
  id: string;
  title: string;
  slug: string;
  seoScore: number;
  views: number;
  avgTimeSec: number;
  bounceRate: number;
}

export interface BlogPerformance {
  source: "ga4" | "simulated";
  articles: ArticleRanked[];
  analysis: string;
}

const memo = { ts: 0, value: null as BlogPerformance | null };
const TTL = 15 * 60_000;

export async function getBlogPerformance(force = false): Promise<BlogPerformance> {
  if (!force && memo.value && Date.now() - memo.ts < TTL) return memo.value;

  const posts = await prisma.blogPost.findMany({
    where: { status: "published" },
    select: { id: true, title: true, slug: true, seoScore: true },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  const articles: ArticleRanked[] = [];
  for (const p of posts) {
    const perf = await getArticlePerformance(p.slug);
    articles.push({
      id: p.id,
      title: p.title,
      slug: p.slug,
      seoScore: p.seoScore,
      views: perf.metrics.views,
      avgTimeSec: perf.metrics.avgTimeSec,
      bounceRate: perf.metrics.bounceRate,
    });
  }
  articles.sort((a, b) => b.views - a.views);

  let analysis = "";
  if (articles.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system:
          "Si SEO analytik. V 2–3 vetách zhodnoť, ktoré články fungujú najlepšie a PREČO (na základe zobrazení, času na stránke, bounce rate a SEO skóre). Buď konkrétny, po slovensky.",
        messages: [
          {
            role: "user",
            content: `Články (zoradené podľa zobrazení):\n${articles
              .slice(0, 10)
              .map(
                (a) =>
                  `- "${a.title}": ${a.views} zobrazení, priem. čas ${a.avgTimeSec}s, bounce ${a.bounceRate}%, SEO ${a.seoScore}/100`,
              )
              .join("\n")}\n\nKtoré fungujú najlepšie a prečo?`,
          },
        ],
      });
      analysis = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    } catch {
      analysis = "";
    }
  }
  if (!analysis && articles.length > 0) {
    const top = articles[0];
    analysis = `Najviac zobrazení má „${top.title}" (${top.views}). Články s vyšším SEO skóre a nižším bounce rate dlhodobo priťahujú viac organickej návštevnosti — zameraj sa na ne a aktualizuj ich.`;
  }

  const result: BlogPerformance = {
    source: ga4Configured() ? "ga4" : "simulated",
    articles,
    analysis,
  };
  memo.ts = Date.now();
  memo.value = result;
  return result;
}
