// Server-side website screenshot capture for the visual quality analysis.
// Uses a configurable screenshot API (default: ScreenshotOne) via SCREENSHOT_API_KEY.
// The key stays server-side and is never persisted or exposed to the client.
// Captured screenshots are uploaded to Supabase Storage so they can be shown in
// the lead detail (the ScreenshotOne URL itself carries the key, so we never
// store that).

const SCREENSHOT_ENDPOINT = process.env.SCREENSHOT_API_URL?.trim() || "https://api.screenshotone.com/take";
const BUCKET = "lead-screenshots";

export function screenshotConfigured(): boolean {
  return Boolean(process.env.SCREENSHOT_API_KEY?.trim());
}

export interface Screenshot {
  base64: string; // for Claude vision
  bytes: Buffer; // for persisting to storage
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
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    return { base64: bytes.toString("base64"), bytes, mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Upload screenshot bytes to Supabase Storage (public bucket "lead-screenshots")
 * and return the public URL. Returns null if storage isn't configured or the
 * upload fails — the scan still succeeds, the detail just shows a placeholder.
 */
export async function uploadScreenshot(bytes: Buffer, contentType = "image/jpeg"): Promise<string | null> {
  const supaUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supaUrl || !supaKey) return null;

  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const upload = await fetch(`${supaUrl}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(20000),
    });
    if (!upload.ok) return null;
    return `${supaUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
  } catch {
    return null;
  }
}
