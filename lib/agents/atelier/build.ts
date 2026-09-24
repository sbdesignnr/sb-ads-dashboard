// Ateliér: celý beh jedného návrhu — zber podkladov, (voliteľne) koncept od art directora,
// skladanie z knižnice, vykreslenie, programová kontrola a screenshoty.
import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";
import sharp from "sharp";
import { collectEvidence, type EvidencePack } from "../../leads/research/collect";
import { captureScreenshot } from "../../leads/screenshot";
import { composePage } from "./compose";
import { directDesign, type Concept, type DesignBrief, type StageCost } from "./design";
import { harvestSite } from "./harvest";
import { renderPage, type PageSpec } from "./kit/modules";
import { qaHtml, type QaIssue } from "./qa";
import { renderHtml } from "./render";

export interface BuildInput {
  lead: Lead & { segment?: { name: string; keywords: string[] } | null };
  /** hotový zber dôkazov z výskumu Nory (ušetrí opakované volania Google) */
  pack?: EvidencePack;
  /** overené zistenia a ponuka z výskumu — návrh z nich vychádza */
  findingsText?: string;
  /** prémiový režim: koncept od Opusa (drahší, originálnejší) */
  director?: boolean;
  onStep?: (m: string) => void;
}

export interface BuildResult {
  html: string;
  spec: PageSpec;
  concept: Concept | null;
  qa: QaIssue[];
  heroJpg: Buffer;
  fullJpg: Buffer;
  costs: StageCost[];
  costEur: number;
  bigIdea: string;
}

export async function buildMockup(input: BuildInput): Promise<BuildResult> {
  const { lead } = input;
  const step = input.onStep ?? (() => {});
  if (!lead.websiteUrl) throw new Error("Lead nemá web.");
  const costs: StageCost[] = [];
  const client = new Anthropic();

  step("Zbieram fotky, farby a texty z ich webu…");
  const assets = await harvestSite(lead.websiteUrl);
  if (!assets) throw new Error("Web firmy sa nepodarilo načítať.");

  const segmentName = lead.segment?.name ?? "firma";
  const pack = input.pack ?? (await collectEvidence({ lead, segmentName, keywords: lead.segment?.keywords ?? [] }));
  const facts: string[] = [];
  if (pack.place?.rating && pack.place.reviewCount && pack.place.rating >= 4.3)
    facts.push(`Google: hodnotenie ${pack.place.rating} z 5, ${pack.place.reviewCount} recenzií`);
  const reviews = pack.items.find((i) => i.kind === "places");
  const research = [
    input.findingsText ? `ZISTENIA O FIRME (overené):\n${input.findingsText}` : "",
    pack.items.find((i) => i.kind === "stored")?.text.slice(0, 900),
    reviews ? `GOOGLE PROFIL A RECENZIE:\n${reviews.text.slice(0, 1800)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const brief: DesignBrief = {
    company: lead.companyName,
    city: lead.companyCity,
    niche: segmentName,
    language: assets.lang,
    facts,
    research,
    assets,
  };

  let concept: Concept | null = null;
  if (input.director) {
    step("Art director vymýšľa dizajnový koncept…");
    const shot = await captureScreenshot(lead.websiteUrl).catch(() => null);
    concept = await directDesign(client, brief, shot?.base64 ?? null, costs);
  }

  step("Skladám novú domovskú stránku…");
  const kitAssets = { images: assets.images.map((i) => i.url), logo: assets.logos[0]?.url ?? null };
  let composed = await composePage(client, brief, { concept }, costs);
  let html = renderPage(composed.spec, kitAssets);

  step("Kontrolujem rozloženie v prehliadači…");
  let qa = await qaHtml(html, assets.origin);
  const high = qa.filter((q) => q.severity === "high");
  if (high.length) {
    step("Opravujem chyby rozloženia…");
    const feedback = high.map((q) => `[${q.viewport}] ${q.where}: ${q.problem}`).join("\n");
    composed = await composePage(client, brief, { concept, feedback: `${feedback}\nZjednoduš problematické moduly (kratšie texty, menej položiek).` }, costs);
    html = renderPage(composed.spec, kitAssets);
    qa = await qaHtml(html, assets.origin);
  }

  step("Vykresľujem náhľady…");
  const desktop = await renderHtml(html, { width: 1440, referer: assets.origin, maxHeight: 9000 });
  const heroJpg = await sharp(desktop.full).extract({ left: 0, top: 0, width: 1440, height: Math.min(960, desktop.height) }).jpeg({ quality: 80 }).toBuffer();
  const fullJpg = await sharp(desktop.full).resize({ width: 900 }).jpeg({ quality: 68 }).toBuffer();
  const costEur = costs.reduce((a, c) => a + c.eur, 0);
  return { html, spec: composed.spec, concept, qa, heroJpg, fullJpg, costs, costEur, bigIdea: composed.bigIdea };
}
