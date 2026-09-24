// Server-side website screenshot capture for the visual quality analysis —
// SELF-HOSTED (vlastný headless Chromium cez Puppeteer), žiadna externá
// platená služba ani API kľúč. Na Verceli beží cez @sparticuz/chromium
// (odľahčená binárka stavaná presne pre serverless prostredie); lokálne padá
// na bežne nainštalovaný Chrome, ak sa nájde, inak čestne vráti null (volajúci
// spadne na textové hodnotenie).

import puppeteer, { type Browser, type Page } from "puppeteer-core";

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

// Naraz max. 2 prehliadače v jednom procese: analyze-bulk spracúva viac leadov
// paralelne a každý headless Chromium zaberie stovky MB — bez stropu by sme
// prekročili pamäť funkcie. Zvyšok leadov medzitým robí PageSpeed/AI (čakanie
// na sieť), takže to celkový čas skoro nepredĺži.
const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  // Slot sa pri uvoľnení odovzdá priamo ďalšiemu čakateľovi (active sa nemení).
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next();
  else active--;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cookie lišty a pop-upy (consent, newsletter) často prekrývajú celú stránku
 * alebo zamknú scroll — AI potom hodnotí banner namiesto webu (reálny prípad:
 * screenshot bol prázdna biela plocha s cookie bannerom). Skryjeme LEN prvky
 * s pevnou/lepivou pozíciou (overlay), aby sme nikdy neschovali obsah stránky
 * s náhodou "cookie" v názve triedy.
 */
async function hideOverlays(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const sel = [
        '[id*="cookie" i]',
        '[class*="cookie" i]',
        '[id*="consent" i]',
        '[class*="consent" i]',
        '[id*="gdpr" i]',
        '[class*="gdpr" i]',
        '[id*="cmp" i]',
        '[aria-label*="cookie" i]',
        '[role="dialog"]',
        '[role="alertdialog"]',
      ].join(",");
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (el === document.body || el === document.documentElement) return;
        const pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky")
          el.style.setProperty("display", "none", "important");
      });
      // Overlay často nastaví overflow:hidden na body (scroll-lock).
      document.documentElement.style.setProperty("overflow", "auto", "important");
      document.body?.style.setProperty("overflow", "auto", "important");
    })
    .catch(() => {});
}

async function closeBrowser(browser: Browser): Promise<void> {
  // browser.close() vie pri zaseknutej stránke visieť — po 5 s zabijeme proces.
  await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
  try {
    browser.process()?.kill("SIGKILL");
  } catch {
    /* už skončil */
  }
}

/**
 * Capture an above-the-fold screenshot of `url` cez vlastný headless Chromium.
 * Returns null keď sa nenájde spustiteľný prehliadač (lokálny vývoj bez
 * nainštalovaného Chrome) alebo pri akomkoľvek zlyhaní — volajúci musí spadnúť
 * na textové hodnotenie, nie zlyhať celý sken.
 *
 * `slow: true` je opakovací pokus pre web, ktorý sa pri prvom pokuse nevykreslil
 * (preloader, animované odhalenie obsahu): dlhšie čakanie + prescrollovanie
 * stránky, aby sa spustilo lazy načítanie.
 */
export async function captureScreenshot(
  url: string,
  opts: { slow?: boolean } = {},
): Promise<Screenshot | null> {
  await acquireSlot();
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

    // "load" (nie networkidle): weby s chat widgetom/analytikou nikdy "neutíchnu"
    // a networkidle2 by po timeoute celý screenshot zahodil, hoci stránka je už
    // dávno vykreslená. Pri timeoute načítania aj tak odfotíme, čo sa stihlo.
    try {
      await page.goto(url, { waitUntil: "load", timeout: 20000 });
    } catch (err) {
      if (!(err instanceof Error && /timeout/i.test(err.message))) throw err;
    }
    // Krátke doťahnutie fontov/obrázkov/CSS, ale ohraničené (nie do nekonečna).
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});

    if (opts.slow) {
      await page
        .evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight / 2);
          await new Promise((r) => setTimeout(r, 600));
          window.scrollTo(0, 0);
        })
        .catch(() => {});
      await sleep(4000);
    } else {
      await sleep(1500);
    }

    await hideOverlays(page);
    await sleep(200);

    const buf = await page.screenshot({ type: "jpeg", quality: 80 });
    return { base64: Buffer.from(buf).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  } finally {
    if (browser) await closeBrowser(browser);
    releaseSlot();
  }
}
