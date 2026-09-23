// Server-side website screenshot capture for the visual quality analysis —
// SELF-HOSTED (vlastný headless Chromium cez Puppeteer), žiadna externá
// platená služba ani API kľúč. Na Verceli beží cez @sparticuz/chromium
// (odľahčená binárka stavaná presne pre serverless prostredie); lokálne padá
// na bežne nainštalovaný Chrome, ak sa nájde, inak čestne vráti null (volajúci
// spadne na textové hodnotenie).

import puppeteer, { type Browser } from "puppeteer-core";

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

// Bežné cesty k desktopovému Chrome/Chromium — len pre lokálny vývoj, kde
// @sparticuz/chromium (Linux binárka) nefunguje.
const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
  "/usr/bin/google-chrome-stable", // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Windows
];

async function findLocalChrome(): Promise<string | null> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH)
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  const { existsSync } = await import("node:fs");
  return LOCAL_CHROME_PATHS.find((p) => existsSync(p)) ?? null;
}

/** Vždy true — vlastný headless prehliadač, žiadny API kľúč netreba. */
export function screenshotConfigured(): boolean {
  return true;
}

export interface Screenshot {
  base64: string;
  mediaType: "image/jpeg";
}

/**
 * Capture an above-the-fold screenshot of `url` cez vlastný headless Chromium.
 * Returns null keď sa nenájde spustiteľný prehliadač (lokálny vývoj bez
 * nainštalovaného Chrome) alebo pri akomkoľvek zlyhaní — volajúci musí spadnúť
 * na textové hodnotenie, nie zlyhať celý sken.
 */
export async function captureScreenshot(url: string): Promise<Screenshot | null> {
  let browser: Browser | null = null;
  try {
    if (isServerless) {
      const chromium = (await import("@sparticuz/chromium")).default;
      browser = await puppeteer.launch({
        executablePath: await chromium.executablePath(),
        args: await puppeteer.defaultArgs({
          args: chromium.args,
          headless: "shell",
        }),
        headless: "shell",
        defaultViewport: { width: 1366, height: 900 },
        timeout: 15000,
      });
    } else {
      const localPath = await findLocalChrome();
      if (!localPath) return null; // lokálny vývoj bez Chrome — čestný pád na text
      browser = await puppeteer.launch({
        executablePath: localPath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: true,
        defaultViewport: { width: 1366, height: 900 },
        timeout: 15000,
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; SBDesignLeadBot/1.0; +https://sbdesign.sk)",
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    // Krátke dodatočné čakanie po "networkidle2" — bez neho hrozí odfotenie
    // ešte nenaštýlovanej stránky (CSS/fonty/obrázky sa dokresľujú aj potom).
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const buf = await page.screenshot({ type: "jpeg", quality: 80 });
    return { base64: Buffer.from(buf).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
