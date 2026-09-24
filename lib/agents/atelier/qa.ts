// Ateliér: programová kontrola vykresleného návrhu (meria sa skutočné rozloženie v prehliadači).
// Spoľahlivejšie než hodnotenie zo screenshotu: úzke stĺpce, pretečenie, prekrývanie, rozbité obrázky.
import puppeteer, { type Browser } from "puppeteer-core";

export interface QaIssue {
  severity: "high" | "med";
  viewport: "desktop" | "mobil";
  where: string;
  problem: string;
}

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LOCAL = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];

async function launch(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ executablePath: await chromium.executablePath(), args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }), headless: "shell" });
  }
  const { existsSync } = await import("node:fs");
  const path = process.env.PUPPETEER_EXECUTABLE_PATH || LOCAL.find((p) => existsSync(p));
  if (!path) throw new Error("Nenašiel sa Chrome.");
  return puppeteer.launch({ executablePath: path, headless: true, args: ["--no-sandbox"] });
}

export async function qaHtml(html: string, referer?: string): Promise<QaIssue[]> {
  const browser = await launch();
  const issues: QaIssue[] = [];
  try {
    for (const vp of [{ name: "desktop" as const, w: 1440, h: 900 }, { name: "mobil" as const, w: 390, h: 844 }]) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument("window.__name = function (f) { return f; }");
      await page.setViewport({ width: vp.w, height: vp.h });
      if (referer) await page.setExtraHTTPHeaders({ Referer: referer });
      await page.setContent(html, { waitUntil: "load", timeout: 40_000 }).catch(() => {});
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 }).catch(() => {});
      // pomocná funkcia, ktorú esbuild (tsx) vkladá do funkcií posielaných do prehliadača
      await page.evaluate("window.__name = function (f) { return f; }");
      await page.evaluate("document.documentElement.classList.remove('js')");
      const found = await page.evaluate((w: number, mobile: boolean) => {
        const out: { severity: "high" | "med"; where: string; problem: string }[] = [];
        const label = (el: Element) => (el.className && typeof el.className === "string" ? `${el.tagName.toLowerCase()}.${el.className.split(" ")[0]}` : el.tagName.toLowerCase());
        // 1) horizontálne pretečenie
        if (document.documentElement.scrollWidth > w + 2) {
          const bad = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > w + 2 && getComputedStyle(e).position !== "fixed").slice(0, 3);
          out.push({ severity: "high", where: bad.map(label).join(", ") || "stránka", problem: `Stránka je širšia než obrazovka (${document.documentElement.scrollWidth}px)` });
        }
        // 2) úzke zalomenie textu
        for (const e of document.querySelectorAll("p,h1,h2,h3,.reg__title,li")) {
          const r = e.getBoundingClientRect();
          const t = (e.textContent ?? "").trim();
          if (t.length < 40 || r.width === 0) continue;
          const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3;
          const lines = r.height / lh;
          if (r.width < (mobile ? 120 : 170) && lines > 4) out.push({ severity: "high", where: label(e), problem: `Text sa láme v úzkom stĺpci (${Math.round(r.width)}px, ~${Math.round(lines)} riadkov)` });
        }
        // 3) rozbité obrázky
        for (const im of document.querySelectorAll("img")) {
          const i = im as HTMLImageElement;
          if (i.complete && i.naturalWidth === 0) out.push({ severity: "med", where: "img", problem: `Obrázok sa nenačítal: ${i.src.slice(0, 80)}` });
        }
        // 4) prekrývanie textových blokov
        const blocks = [...document.querySelectorAll("h1,h2,h3,p,.btn,.facts strong,.reg__val,.eyebrow")].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 8 && x.r.height > 8 && getComputedStyle(x.e).visibility !== "hidden");
        for (let i = 0; i < blocks.length; i++) {
          for (let j = i + 1; j < blocks.length; j++) {
            const a = blocks[i];
            const b = blocks[j];
            if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
            const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (ix > 6 && iy > 6 && (ix * iy) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height) > 0.25) out.push({ severity: "high", where: `${label(a.e)} × ${label(b.e)}`, problem: "Textové bloky sa prekrývajú" });
          }
        }
        return out.slice(0, 8);
      }, vp.w, vp.name === "mobil");
      for (const f of found) issues.push({ ...f, viewport: vp.name });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return issues;
}
