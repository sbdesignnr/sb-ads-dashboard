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
  opts: { width: number; height?: number; referer?: string; maxHeight?: number; keepViewport?: boolean } = { width: 1440 },
): Promise<Rendered> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = function (f) { return f; }; window.__RT_STATIC = 1;");
    await page.setViewport({ width: opts.width, height: opts.height ?? 900, deviceScaleFactor: 1 });
    if (opts.referer) await page.setExtraHTTPHeaders({ Referer: opts.referer });
    // screenshot je vždy statický a deterministický: bez animácií a pohybu pri scrolle
    await page.setContent(html.replace(/data-fx="[^"]*"/, 'data-fx=""'), { waitUntil: "load", timeout: 40_000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 900, timeout: 25_000 }).catch(() => {});
    await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => {});
    // animácie pri scrollovaní sa v screenshote vypnú (inak by spodok stránky ostal skrytý)
    await page.evaluate("window.__name = function (f) { return f; }").catch(() => {});
    await page.evaluate("document.documentElement.classList.remove('js')").catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    const height = Math.min(
      opts.maxHeight ?? 6000,
      await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)),
    );
    // pri stránkach s výškami v vh sa okno nesmie zväčšovať na celú výšku (hero by narástol)
    if (!opts.keepViewport) await page.setViewport({ width: opts.width, height, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const full = (await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: opts.width, height }, captureBeyondViewport: true })) as Buffer;
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

export interface LiveFrames {
  /** okná zo živej stránky pri posúvaní (JPEG), rovnomerne rozložené po celej výške */
  frames: { jpg: Buffer; y: number }[];
  total: number;
}

/**
 * Živý náhľad: stránka sa NEZASTAVUJE v statickom režime, plynulo sa po nej posúva a robia sa
 * snímky okna. Vidno tak pripnuté scény, odhaľovanie a rozsvecovanie textu tak, ako ich uvidí
 * návštevník (statický screenshot ich zruší).
 */
export async function captureLive(
  html: string,
  opts: { width: number; height: number; frames: number; referer?: string; outWidth?: number },
): Promise<LiveFrames> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = function (f) { return f; }");
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    if (opts.referer) await page.setExtraHTTPHeaders({ Referer: opts.referer });
    await page.setContent(html, { waitUntil: "load", timeout: 40_000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 900, timeout: 25_000 }).catch(() => {});
    await page.evaluate("window.__name = function (f) { return f; }").catch(() => {});
    await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 3200)); // dokončí sa úvodná opona a animácie hero
    const total = (await page.evaluate("Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")) as number;
    const maxY = Math.max(0, total - opts.height);
    const n = Math.max(1, Math.min(opts.frames, Math.ceil(total / opts.height)));
    const frames: LiveFrames["frames"] = [];
    let cur = 0;
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : Math.round((maxY * i) / (n - 1));
      for (let k = 1; k <= 6; k++) {
        await page.evaluate(`window.scrollTo(0, ${cur + ((y - cur) * k) / 6})`);
        await new Promise((r) => setTimeout(r, 110));
      }
      cur = y;
      await new Promise((r) => setTimeout(r, 1200));
      let buf: Buffer = Buffer.from(await page.screenshot({ type: "jpeg", quality: 72 }));
      if (opts.outWidth && opts.outWidth < opts.width) buf = await sharp(buf).resize({ width: opts.outWidth }).jpeg({ quality: 72 }).toBuffer();
      frames.push({ jpg: buf, y });
    }
    return { frames, total };
  } finally {
    await browser.close();
  }
}

/** Zloží snímky do jedného náhľadu (mriežka), použije sa ako "celá stránka" v pracovni. */
export async function frameSheet(frames: { jpg: Buffer }[], cols = 2, tileW = 450): Promise<Buffer> {
  const metas = await Promise.all(frames.map((f) => sharp(f.jpg).metadata()));
  const ratio = (metas[0].height ?? 900) / (metas[0].width ?? 1440);
  const th = Math.round(tileW * ratio);
  const tiles = await Promise.all(frames.map((f) => sharp(f.jpg).resize(tileW, th).toBuffer()));
  const rows = Math.ceil(tiles.length / cols);
  return sharp({ create: { width: cols * (tileW + 6) - 6, height: rows * (th + 6) - 6, channels: 3, background: "#777777" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (tileW + 6), top: Math.floor(i / cols) * (th + 6) })))
    .jpeg({ quality: 70 })
    .toBuffer();
}
