// Server-side website screenshot capture for the visual quality analysis.
// Uses a configurable screenshot API (default: ScreenshotOne) via SCREENSHOT_API_KEY.
// The key stays server-side and is never persisted or exposed to the client.

const SCREENSHOT_ENDPOINT = process.env.SCREENSHOT_API_URL?.trim() || "https://api.screenshotone.com/take";

export function screenshotConfigured(): boolean {
  return Boolean(process.env.SCREENSHOT_API_KEY?.trim());
}

export interface Screenshot {
  base64: string;
  mediaType: "image/jpeg";
}

/**
 * Capture an above-the-fold screenshot of `url`. Returns null when unconfigured
 * or on any failure — callers must degrade gracefully (fall back to HTML-based
 * visual analysis) rather than break the scan.
 */
export async function captureScreenshot(url: string): Promise<Screenshot | null> {
  const key = process.env.SCREENSHOT_API_KEY?.trim();
  if (!key) return null;

  const q = new URLSearchParams({
    access_key: key,
    url,
    format: "jpg",
    image_quality: "80",
    viewport_width: "1366",
    viewport_height: "900",
    device_scale_factor: "1",
    full_page: "false",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    // Cache aggressively so re-scanning the same site doesn't re-bill the service.
    cache: "true",
    cache_ttl: "2592000", // 30 days
    timeout: "10",
  });

  try {
    const res = await fetch(`${SCREENSHOT_ENDPOINT}?${q.toString()}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) return null;
    return { base64: Buffer.from(buf).toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}
