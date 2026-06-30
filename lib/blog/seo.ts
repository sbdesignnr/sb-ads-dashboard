export interface SeoInput {
  title?: string;
  content?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  targetKeyword?: string | null;
}

/** Plain-text word count from Markdown. */
export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_~\-|]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Basic 0-100 SEO score (Phase A). Phase B adds the full real-time checklist.
 */
export function computeSeoScore(p: SeoInput): number {
  let score = 0;
  const content = p.content ?? "";
  const words = wordCount(content);
  score += words >= 300 ? 25 : Math.round((words / 300) * 25);

  const mt = (p.metaTitle ?? "").length;
  score += mt >= 50 && mt <= 60 ? 20 : mt > 0 ? 10 : 0;

  const md = (p.metaDescription ?? "").length;
  score += md >= 150 && md <= 160 ? 20 : md > 0 ? 10 : 0;

  const kw = (p.targetKeyword ?? "").toLowerCase().trim();
  score += kw && content.toLowerCase().includes(kw) ? 20 : 0;

  score += /(^|\n)#{1,3}\s/.test(content) ? 15 : 0;

  return Math.max(0, Math.min(100, score));
}

export function seoColor(score: number): "danger" | "warning" | "success" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}
