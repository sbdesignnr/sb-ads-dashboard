// Ateliér: generované obrázky (atmosférické fotografie bez ľudí, textov a značiek) cez OpenAI
// gpt-image-1. Slúžia len tam, kde firma nemá vlastné fotky; nikdy nezobrazujú "ich" budovu
// ani ľudí. Výsledok sa vkladá do stránky ako data URI (JPEG), náklad sa zapíše do pokladnice.
import sharp from "sharp";
import { recordOther } from "../../budget";

export interface ImagePrompt {
  prompt: string;
  aspect?: "landscape" | "portrait" | "square";
  quality?: "low" | "medium";
}

const SIZE = { landscape: "1536x1024", portrait: "1024x1536", square: "1024x1024" } as const;
const SAFE_SUFFIX = ", editorial photography, natural light, high detail, no people, no faces, no text, no logos, no watermarks, no brand names";

export function imageGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Vygeneruje jeden obrázok; pri chybe vráti null (návrh sa dokončí s grafikou). */
export async function generateImage(p: ImagePrompt): Promise<{ dataUri: string; eur: number } | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const aspect = p.aspect ?? "landscape";
  const quality = p.quality ?? "low";
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt: `${p.prompt.slice(0, 700)}${SAFE_SUFFIX}`, size: SIZE[aspect], quality, n: 1 }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { b64_json?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) return null;
    // ceny gpt-image-1: vstup text ≈ 5 $/M, výstup obrázok ≈ 40 $/M
    const eur = (((j.usage?.input_tokens ?? 60) * 5 + (j.usage?.output_tokens ?? 400) * 40) / 1_000_000) * 0.92;
    recordOther("image", eur, "gpt-image-1");
    const jpg = await sharp(Buffer.from(b64, "base64")).resize({ width: aspect === "portrait" ? 1000 : 1600, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
    return { dataUri: `data:image/jpeg;base64,${jpg.toString("base64")}`, eur };
  } catch {
    return null;
  }
}

export async function generateImages(list: ImagePrompt[]): Promise<({ dataUri: string; eur: number } | null)[]> {
  return Promise.all(list.slice(0, 4).map((p) => generateImage(p)));
}
