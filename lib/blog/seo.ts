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

export function seoColor(score: number): "danger" | "warning" | "success" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}
