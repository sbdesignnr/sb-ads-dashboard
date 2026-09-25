// Ateliér: celý beh jedného návrhu — zber podkladov, (voliteľne) koncept od art directora,
// skladanie z knižnice, vykreslenie, programová kontrola a screenshoty.
import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";
import sharp from "sharp";
import type { EvidencePack } from "../../leads/research/collect";
import { findPlaceProfile } from "../../leads/research/places";
import { captureScreenshot } from "../../leads/screenshot";
import { composePage, PREMIUM_MODEL } from "./compose";
import { buildFree, conceive, materialize, refineFree, sanitizeFree, type FreeConcept } from "./freeform";
import { fontPair } from "./kit/fonts";
import { generateImages, imageGenConfigured } from "./kit/imagery";
import { critiquePage, type Concept, type DesignBrief, type StageCost } from "./design";
import { harvestSite } from "./harvest";
import { renderPage, type PageSpec } from "./kit/modules";
import { qaHtml, type QaIssue } from "./qa";
import { captureLive, frameSheet, renderHtml, sliceForVision } from "./render";

export interface BuildInput {
  lead: Lead & { segment?: { name: string; keywords: string[] } | null };
  /** hotový zber dôkazov z výskumu Nory (ušetrí opakované volania Google) */
  pack?: EvidencePack;
  /** overené zistenia a ponuka z výskumu — návrh z nich vychádza */
  findingsText?: string;
  /** prémiový režim: najlepší model, generované obrázky, vlastný blok, kritika a oprava (drahší, originálnejší) */
  director?: boolean;
  /** smer dizajnu z porady agentov (Ateliér ho zohľadní v koncepte) */
  direction?: string;
  onStep?: (m: string) => void;
}

export interface BuildResult {
  html: string;
  spec: PageSpec | { freeform: true; fontPair: string } | null;
  concept: Concept | FreeConcept | null;
  qa: QaIssue[];
  heroJpg: Buffer;
  fullJpg: Buffer;
  costs: StageCost[];
  costEur: number;
  bigIdea: string;
  /** názor kreatívneho riaditeľa na výsledok (len prémiový režim) */
  critique?: { score: number; verdict: string } | null;
  generatedImages?: number;
}

interface FreeCtx {
  lead: Lead;
  brief: DesignBrief;
  assets: NonNullable<Awaited<ReturnType<typeof harvestSite>>>;
  costs: StageCost[];
  client: Anthropic;
  step: (m: string) => void;
  direction?: string;
}

/** Prémiový beh: koncept → generované fotky → stavba od nuly → kontrola → oprava → kritika → oprava. */
async function buildFreeform({ lead, brief, assets, costs, client, step, direction }: FreeCtx): Promise<BuildResult> {
  step("Art director si prezerá ich súčasný web…");
  const shot = await captureScreenshot(lead.websiteUrl!).catch(() => null);
  step("Art director vymýšľa koncept…");
  const concept = await conceive(client, brief, shot?.base64 ?? null, costs, direction);

  let generated: (string | null)[] = [];
  if (concept.generated_images.length && imageGenConfigured()) {
    step("Generujem atmosférické fotografie…");
    generated = (await generateImages(concept.generated_images)).map((g) => g?.dataUri ?? null);
  }
  const mats = { photos: assets.images.map((i) => i.url), generated, logo: assets.logos[0]?.url ?? assets.logo ?? null };
  const generatedCount = generated.filter(Boolean).length;

  step("Creative developer skladá stránku od nuly…");
  let template = await buildFree(client, brief, concept, concept.generated_images.map((_, i) => Boolean(generated[i])), costs);
  const assemble = (t: string) => {
    const clean = sanitizeFree(t, assets.origin);
    let html = materialize(clean.html, mats, assets.origin).html;
    if (generatedCount) html = html.replace(/<\/body>/i, '<p style="margin:0;padding:10px 16px;font:12px system-ui;opacity:.55;text-align:center">Fotografie v ukážke sú ilustračné.</p></body>');
    return html;
  };
  let html = assemble(template);

  step("Kontrolujem rozloženie v prehliadači…");
  let qa = await qaHtml(html, assets.origin);
  const highOf = (q: QaIssue[]) => q.filter((x) => x.severity === "high");
  if (highOf(qa).length) {
    step("Opravujem chyby rozloženia…");
    const r = await refineFree(client, template, highOf(qa).map((q) => `[${q.viewport}] ${q.where}: ${q.problem}`).join("\n"), costs, "oprava (rozloženie)");
    const html2 = assemble(r.html);
    const qa2 = await qaHtml(html2, assets.origin);
    if (highOf(qa2).length <= highOf(qa).length) {
      template = r.html;
      html = html2;
      qa = qa2;
    }
  }

  const shotOpts = { referer: assets.origin, keepViewport: true } as const;
  void shotOpts;
  const critiqueNote =
    "Snímky sú ZO ŽIVEJ stránky pri posúvaní (rovnomerne po celej dĺžke): vidíš aj pripnuté scény, odhaľovanie a rozsvecovanie textu v priebehu. Prázdne miesto na jednom snímku môže byť rozpracovaná animácia; posudzuj celok, nie jeden záber. Interaktívne nástroje (posuvníky, filtre) nevidíš v použití, ale posúď, či sú viditeľné a zrozumiteľné.";
  const liveCritique = async (h: string) => {
    const [d, m] = await Promise.all([
      captureLive(h, { width: 1440, height: 900, frames: 10, referer: assets.origin, outWidth: 1100 }),
      captureLive(h, { width: 390, height: 844, frames: 3, referer: assets.origin }),
    ]);
    const label = (f: { y: number }, total: number, w: number) => `${w}px, posun ${Math.round((f.y / total) * 100)} % z ${total}px`;
    return {
      desktop: d.frames.map((f) => ({ base64: f.jpg.toString("base64"), label: label(f, d.total, 1440) })),
      mobile: m.frames.map((f) => ({ base64: f.jpg.toString("base64"), label: label(f, m.total, 390) })),
      raw: d,
    };
  };

  step("Kreatívny riaditeľ hodnotí návrh…");
  let live = await liveCritique(html);
  const crit = await critiquePage(client, live.desktop, live.mobile, costs, PREMIUM_MODEL, critiqueNote);
  const critique = { score: Number(crit.score) || 0, verdict: String(crit.verdict ?? "") };
  if (critique.score < 8 && crit.issues?.length) {
    step("Vylepšujem návrh podľa kritiky…");
    const feedback =
      `Skóre ${crit.score}/10. ${crit.verdict}\n` +
      crit.issues.slice(0, 8).map((i, n) => `${n + 1}. [${i.area}] ${i.problem} -> ${i.fix}`).join("\n") +
      (crit.generic_tells?.length ? `\nZnaky šablóny, ktoré odstráň: ${crit.generic_tells.join("; ")}` : "") +
      "\nPOZOR: kritik videl snímky z animovanej stránky; ak je výhrada o prázdnom mieste alebo scéne, over v kóde, či nejde len o rozpracovanú animáciu, a v takom prípade nič nemeň.";
    const r = await refineFree(client, template, feedback, costs, "oprava (kritika)");
    step(`Kontrola po oprave (zmien použitých ${r.applied}, preskočených ${r.skipped})…`);
    const html2 = assemble(r.html);
    const qa2 = await qaHtml(html2, assets.origin);
    if (r.applied > 0 && highOf(qa2).length <= highOf(qa).length) {
      template = r.html;
      html = html2;
      qa = qa2;
      live = await liveCritique(html);
    }
  }

  step("Vykresľujem náhľady…");
  const heroJpg = await sharp(live.raw.frames[0].jpg).resize({ width: 1440 }).jpeg({ quality: 82 }).toBuffer();
  const fullJpg = await frameSheet(live.raw.frames.slice(0, 8), 2, 450);
  const costEur = costs.reduce((a, c) => a + c.eur, 0);
  return { html, spec: { freeform: true, fontPair: fontPairLabel(concept) }, concept, qa, heroJpg, fullJpg, costs, costEur, bigIdea: concept.big_idea, critique, generatedImages: generatedCount };
}

const fontPairLabel = (c: FreeConcept) => fontPair(c.font_pair).display;

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
  // Z Google potrebujeme len profil a recenzie (1 volanie); celý zber dôkazov robí Nora sama
  // a pošle ho sem hotový.
  const place = input.pack ? input.pack.place : await findPlaceProfile(lead.companyName, lead.companyCity, lead.websiteUrl);
  const facts: string[] = [];
  if (place?.rating && place.reviewCount && place.rating >= 4.3)
    facts.push(`Google: hodnotenie ${place.rating} z 5, ${place.reviewCount} recenzií`);
  const reviewsText = place?.reviews?.length
    ? place.reviews
        .slice(0, 5)
        .map((r) => `- ${r.rating ?? "?"}★ „${r.text.replace(/\s+/g, " ").slice(0, 260)}“`)
        .join("\n")
    : "";
  const stored = input.pack?.items.find((i) => i.kind === "stored")?.text.slice(0, 900) ?? [lead.aiSummary, lead.aiOpportunity].filter(Boolean).join("\n");
  const research = [
    input.findingsText ? `ZISTENIA O FIRME (overené):\n${input.findingsText}` : "",
    stored,
    reviewsText ? `GOOGLE RECENZIE (doslovné, smú sa citovať):\n${reviewsText}` : "",
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

  const premium = Boolean(input.director);
  const concept: Concept | null = null;

  // prémiový režim: art director píše stránku od nuly (freeform); ak zlyhá, padne na skladanie z knižnice
  if (premium && process.env.ATELIER_FREEFORM !== "0") {
    try {
      return await buildFreeform({ lead, brief, assets, costs, client, step, direction: input.direction });
    } catch (e) {
      step(`Voľný návrh sa nepodaril (${(e as Error).message.slice(0, 80)}), skladám z knižnice…`);
    }
  }

  step(premium ? "Art director navrhuje koncept a skladá stránku…" : "Skladám novú domovskú stránku…");
  const realImages = assets.images.map((i) => i.url);
  const buildOnce = async (feedback?: string) => {
    const composed = await composePage(client, brief, { mode: premium ? "premium" : "standard", model: premium ? PREMIUM_MODEL : undefined, feedback, direction: input.direction }, costs);
    // generované obrázky (len tam, kde firma nemá vlastné fotky)
    let images = [...realImages];
    let generatedCount = 0;
    if (composed.generated.length && imageGenConfigured()) {
      step("Generujem atmosférické fotografie…");
      const gen = await generateImages(composed.generated);
      for (const g of gen) {
        images.push(g?.dataUri ?? "");
        if (g) generatedCount++;
      }
      // chýbajúce sloty ostanú prázdne (vykreslí sa grafika)
      images = images.slice(0, realImages.length + composed.generated.length);
    }
    if (generatedCount && composed.spec.footer) composed.spec.footer.lines = [...(composed.spec.footer.lines ?? []), "Fotografie v ukážke sú ilustračné."];
    const kitAssets = { images, logo: assets.logos[0]?.url ?? null };
    return { composed, kitAssets, html: renderPage(composed.spec, kitAssets), generatedCount };
  };

  let built = await buildOnce();
  step("Kontrolujem rozloženie v prehliadači…");
  let qa = await qaHtml(built.html, assets.origin);
  const high = qa.filter((q) => q.severity === "high");
  if (high.length) {
    step("Opravujem chyby rozloženia…");
    const feedback = high.map((q) => `[${q.viewport}] ${q.where}: ${q.problem}`).join("\n");
    built = await buildOnce(`${feedback}\nZjednoduš problematické moduly (kratšie texty, menej položiek).`);
    qa = await qaHtml(built.html, assets.origin);
  }

  // prémiový režim: kritika kreatívneho riaditeľa zo screenshotu a jedno vylepšenie
  let critique: BuildResult["critique"] = null;
  if (premium) {
    step("Kreatívny riaditeľ hodnotí návrh…");
    const dShot = await renderHtml(built.html, { width: 1440, referer: assets.origin, maxHeight: 9000 });
    const mShot = await renderHtml(built.html, { width: 390, height: 844, referer: assets.origin, maxHeight: 2600 });
    const c = await critiquePage(client, await sliceForVision(dShot, 1000, 6), await sliceForVision(mShot, 1300, 1), costs, PREMIUM_MODEL);
    critique = { score: Number(c.score) || 0, verdict: String(c.verdict ?? "") };
    if (critique.score < 9 && c.issues?.length) {
      step("Vylepšujem návrh podľa kritiky…");
      const feedback = `Skóre ${c.score}/10. ${c.verdict}\n` + c.issues.slice(0, 7).map((i, n) => `${n + 1}. [${i.area}] ${i.problem} -> ${i.fix}`).join("\n") + (c.generic_tells?.length ? `\nZnaky šablóny, ktoré odstráň: ${c.generic_tells.join("; ")}` : "");
      const improved = await buildOnce(feedback);
      const qa2 = await qaHtml(improved.html, assets.origin);
      // vylepšená verzia sa použije, len ak nemá horšie chyby rozloženia
      if (qa2.filter((q) => q.severity === "high").length <= qa.filter((q) => q.severity === "high").length) {
        built = improved;
        qa = qa2;
      }
    }
  }
  const html = built.html;
  const composed = built.composed;

  step("Vykresľujem náhľady…");
  const desktop = await renderHtml(html, { width: 1440, referer: assets.origin, maxHeight: 9000 });
  const heroJpg = await sharp(desktop.full).extract({ left: 0, top: 0, width: 1440, height: Math.min(960, desktop.height) }).jpeg({ quality: 80 }).toBuffer();
  const fullJpg = await sharp(desktop.full).resize({ width: 900 }).jpeg({ quality: 68 }).toBuffer();
  const costEur = costs.reduce((a, c) => a + c.eur, 0);
  return { html, spec: composed.spec, concept, qa, heroJpg, fullJpg, costs, costEur, bigIdea: composed.bigIdea, critique, generatedImages: built.generatedCount };
}
