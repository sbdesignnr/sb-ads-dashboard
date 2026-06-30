import { seoColor } from "./seo";

export type CheckStatus = "ok" | "warn" | "error";

export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  weight: number;
}

export interface LinkSuggestion {
  title: string;
  slug: string;
}

export interface SeoAnalysis {
  score: number;
  color: "danger" | "warning" | "success";
  words: number;
  checks: SeoCheck[];
  internalLinkSuggestions: LinkSuggestion[];
}

export interface AnalyzeInput {
  title?: string;
  content?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  targetKeyword?: string | null;
  otherPosts?: { id?: string; title: string; slug: string }[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Heading {
  level: number;
  text: string;
}
function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  for (const line of md.split("\n")) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

const STOP = new Set([
  "a", "the", "na", "pre", "pri", "vo", "so", "zo", "do", "od", "po", "ako", "je",
  "su", "aj", "alebo", "ktora", "ktore", "ktory", "tento", "tato", "toto", "ich", "vas",
]);
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function analyzeSeo(input: AnalyzeInput): SeoAnalysis {
  const title = input.title ?? "";
  const content = input.content ?? "";
  const metaTitle = input.metaTitle ?? "";
  const metaDescription = input.metaDescription ?? "";
  const kw = (input.targetKeyword ?? "").trim().toLowerCase();

  const plain = toPlainText(content);
  const plainLower = plain.toLowerCase();
  const words = plain ? plain.split(/\s+/).length : 0;

  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, message: string, weight: number) =>
    checks.push({ id, label, status, message, weight });

  // 1. Content length
  if (words >= 600) add("length", "Dĺžka obsahu", "ok", `${words} slov (odporúčané 600+, ideálne 800+).`, 15);
  else if (words >= 300) add("length", "Dĺžka obsahu", "warn", `${words} slov — dopíš aspoň na 600 slov pre lepší ranking.`, 15);
  else add("length", "Dĺžka obsahu", "error", `${words} slov — príliš krátke. Cieľ je 600+ slov.`, 15);

  // 2-5. Keyword checks
  if (!kw) {
    add("kw-title", "Kľúčové slovo", "warn", "Nastav cieľové kľúčové slovo pre SEO analýzu.", 10);
    add("kw-density", "Hustota kľúčového slova", "warn", "Po nastavení kľúčového slova vyhodnotím hustotu.", 10);
    add("kw-intro", "Kľúčové slovo v úvode", "warn", "Nastav kľúčové slovo.", 5);
    add("kw-meta", "Kľúčové slovo v meta description", "warn", "Nastav kľúčové slovo.", 5);
  } else {
    const occ = (plainLower.match(new RegExp(escapeRegExp(kw), "g")) ?? []).length;
    const density = words > 0 ? (occ / words) * 100 : 0;

    add(
      "kw-title",
      "Kľúčové slovo v nadpise",
      title.toLowerCase().includes(kw) ? "ok" : "warn",
      title.toLowerCase().includes(kw)
        ? "Kľúčové slovo je v názve článku."
        : `Pridaj „${input.targetKeyword}" do názvu článku.`,
      10,
    );

    if (occ === 0) add("kw-density", "Hustota kľúčového slova", "error", "Kľúčové slovo sa v obsahu vôbec nevyskytuje.", 10);
    else if (density > 3.5) add("kw-density", "Hustota kľúčového slova", "warn", `Hustota ${density.toFixed(1)} % — možný keyword stuffing, zmierni výskyty.`, 10);
    else if (occ < 2) add("kw-density", "Hustota kľúčového slova", "warn", `Iba ${occ}× — pridaj ešte pár prirodzených výskytov (ideál 0,5–2,5 %).`, 10);
    else add("kw-density", "Hustota kľúčového slova", "ok", `${occ}× v obsahu (hustota ${density.toFixed(1)} %).`, 10);

    const intro = plainLower.slice(0, 600);
    add(
      "kw-intro",
      "Kľúčové slovo v úvode",
      intro.includes(kw) ? "ok" : "warn",
      intro.includes(kw) ? "Kľúčové slovo je v úvodnom odseku." : "Spomeň kľúčové slovo už v prvom odseku.",
      5,
    );

    add(
      "kw-meta",
      "Kľúčové slovo v meta description",
      metaDescription.toLowerCase().includes(kw) ? "ok" : "warn",
      metaDescription.toLowerCase().includes(kw) ? "Kľúčové slovo je v meta description." : "Pridaj kľúčové slovo do meta description.",
      5,
    );
  }

  // 6. Meta title length
  const mtl = metaTitle.length;
  if (mtl >= 50 && mtl <= 60) add("meta-title", "Dĺžka meta title", "ok", `${mtl} znakov — ideálne (50–60).`, 15);
  else if (mtl === 0) add("meta-title", "Dĺžka meta title", "error", "Meta title chýba — pridaj 50–60 znakov.", 15);
  else if (mtl < 50) add("meta-title", "Dĺžka meta title", "warn", `${mtl} znakov — krátke (cieľ 50–60).`, 15);
  else add("meta-title", "Dĺžka meta title", "warn", `${mtl} znakov — dlhé, Google ho odreže (cieľ 50–60).`, 15);

  // 7. Meta description length
  const mdl = metaDescription.length;
  if (mdl >= 150 && mdl <= 160) add("meta-desc", "Dĺžka meta description", "ok", `${mdl} znakov — ideálne (150–160).`, 15);
  else if (mdl === 0) add("meta-desc", "Dĺžka meta description", "error", "Meta description chýba — pridaj 150–160 znakov.", 15);
  else if (mdl < 150) add("meta-desc", "Dĺžka meta description", "warn", `${mdl} znakov — krátke (cieľ 150–160).`, 15);
  else add("meta-desc", "Dĺžka meta description", "warn", `${mdl} znakov — dlhé, Google ho odreže (cieľ 150–160).`, 15);

  // 8. Heading structure (H2 count)
  const headings = parseHeadings(content);
  const h2 = headings.filter((h) => h.level === 2).length;
  if (h2 >= 2) add("headings", "Nadpisy (H2)", "ok", `${h2} H2 podnadpisov — dobrá štruktúra.`, 10);
  else if (h2 === 1) add("headings", "Nadpisy (H2)", "warn", "Iba 1 H2 — rozdeľ obsah do viacerých sekcií (##).", 10);
  else add("headings", "Nadpisy (H2)", "error", "Žiadne H2 podnadpisy — pridaj sekcie pomocou ## .", 10);

  // 9. Heading hierarchy (single H1, no skipped levels)
  const h1 = headings.filter((h) => h.level === 1).length;
  let skip = false;
  let lastLevel = 1;
  for (const h of headings) {
    if (h.level > lastLevel + 1) skip = true;
    lastLevel = h.level;
  }
  if (h1 > 1) add("hierarchy", "Hierarchia nadpisov", "warn", "Viac H1 v obsahu — názov článku je H1, v texte používaj H2/H3.", 5);
  else if (skip) add("hierarchy", "Hierarchia nadpisov", "warn", "Preskočená úroveň nadpisu (napr. H2 → H4). Dodrž poradie.", 5);
  else add("hierarchy", "Hierarchia nadpisov", "ok", "Hierarchia nadpisov je v poriadku.", 5);

  // 10. Internal links
  const noImages = content.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  const links = [...noImages.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  const internal = links.filter((m) => {
    const url = m[2];
    return url.startsWith("/") || url.includes("sbdesign.sk");
  });
  const linkedSlugs = new Set(internal.map((m) => m[2].split("/").filter(Boolean).pop() ?? ""));
  if (internal.length >= 1) add("internal", "Interné prelinkovanie", "ok", `${internal.length} interných odkazov.`, 5);
  else add("internal", "Interné prelinkovanie", "warn", "Pridaj odkazy na súvisiace články/stránky (viď návrhy nižšie).", 5);

  // 11. Image alt texts
  const images = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  const missingAlt = images.filter((m) => !m[1].trim()).length;
  if (images.length === 0) add("img-alt", "Obrázky a alt texty", "warn", "Žiadne obrázky — pridaj aspoň jeden s alt textom.", 5);
  else if (missingAlt > 0) add("img-alt", "Obrázky a alt texty", "error", `${missingAlt} z ${images.length} obrázkov nemá alt text.`, 5);
  else add("img-alt", "Obrázky a alt texty", "ok", `${images.length} obrázkov, všetky majú alt text.`, 5);

  // Score
  const factor = (s: CheckStatus) => (s === "ok" ? 1 : s === "warn" ? 0.5 : 0);
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + c.weight * factor(c.status), 0);
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;

  // Internal link suggestions
  const terms = tokenize(`${input.targetKeyword ?? ""} ${title}`);
  const internalLinkSuggestions: LinkSuggestion[] = (input.otherPosts ?? [])
    .filter((p) => !linkedSlugs.has(p.slug))
    .map((p) => ({ p, score: tokenize(p.title).filter((w) => terms.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ title: x.p.title, slug: x.p.slug }));

  return { score, color: seoColor(score), words, checks, internalLinkSuggestions };
}
