// Ateliér: vykreslenie návrhu (HTML) do screenshotov cez headless Chromium.
// Lokálne padá na nainštalovaný Chrome, na Verceli beží cez @sparticuz/chromium.
import puppeteer, { type Browser } from "puppeteer-core";
import sharp from "sharp";

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LOCAL = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

async function launch(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      headless: "shell",
    });
  }
  const { existsSync } = await import("node:fs");
  const path = process.env.PUPPETEER_EXECUTABLE_PATH || LOCAL.find((p) => existsSync(p));
  if (!path) throw new Error("Nenašiel sa Chrome na vykreslenie návrhu.");
  return puppeteer.launch({ executablePath: path, headless: true, args: ["--no-sandbox"] });
}

export interface Rendered {
  /** celá stránka ako PNG */
  full: Buffer;
  width: number;
  height: number;
}

/** Vykreslí HTML na danej šírke (celá stránka, najviac maxHeight px). */
export async function renderHtml(
  html: string,
  opts: { width: number; height?: number; referer?: string; maxHeight?: number } = { width: 1440 },
): Promise<Rendered> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height ?? 900, deviceScaleFactor: 1 });
    if (opts.referer) await page.setExtraHTTPHeaders({ Referer: opts.referer });
    await page.setContent(html, { waitUntil: "load", timeout: 40_000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 900, timeout: 25_000 }).catch(() => {});
    await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    const height = Math.min(
      opts.maxHeight ?? 6000,
      await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)),
    );
    await page.setViewport({ width: opts.width, height, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const full = (await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: opts.width, height } })) as Buffer;
    return { full: Buffer.from(full), width: opts.width, height };
  } finally {
    await browser.close();
  }
}

/** Rozreže vysokú stránku na okná vhodné pre vizuálnu kontrolu modelom (JPEG, nízke tokeny). */
export async function sliceForVision(r: Rendered, sliceHeight = 1000, maxSlices = 5): Promise<{ base64: string; label: string }[]> {
  const out: { base64: string; label: string }[] = [];
  const n = Math.min(maxSlices, Math.ceil(r.height / sliceHeight));
  for (let i = 0; i < n; i++) {
    const top = i * sliceHeight;
    const h = Math.min(sliceHeight, r.height - top);
    const buf = await sharp(r.full).extract({ left: 0, top, width: r.width, height: h }).jpeg({ quality: 72 }).toBuffer();
    out.push({ base64: buf.toString("base64"), label: `${r.width}px, výška ${top}–${top + h} z ${r.height}` });
  }
  return out;
}
