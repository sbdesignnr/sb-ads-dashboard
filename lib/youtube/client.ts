const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeNotConfiguredError extends Error {
  constructor() {
    super("YOUTUBE_API_KEY nie je nastavený.");
    this.name = "YouTubeNotConfiguredError";
  }
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

function key(): string {
  const k = process.env.YOUTUBE_API_KEY?.trim();
  if (!k) throw new YouTubeNotConfiguredError();
  return k;
}

export interface ResolvedChannel {
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
}

type InputKind = "id" | "handle" | "username" | "search";

function parseChannelInput(input: string): { kind: InputKind; value: string } {
  const s = input.trim();
  let m = s.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (m) return { kind: "id", value: m[1] };
  if (/^UC[\w-]{20,}$/.test(s)) return { kind: "id", value: s };
  m = s.match(/youtube\.com\/@([\w.\-]+)/i);
  if (m) return { kind: "handle", value: m[1] };
  if (s.startsWith("@")) return { kind: "handle", value: s.slice(1) };
  m = s.match(/youtube\.com\/user\/([\w.\-]+)/i);
  if (m) return { kind: "username", value: m[1] };
  m = s.match(/youtube\.com\/c\/([\w.\-]+)/i);
  if (m) return { kind: "search", value: m[1] };
  return { kind: "search", value: s };
}

interface ChannelSnippet {
  id: string;
  snippet?: {
    title?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
}

function toResolved(item: ChannelSnippet | undefined): ResolvedChannel | null {
  if (!item?.id) return null;
  const t = item.snippet?.thumbnails;
  return {
    channelId: item.id,
    channelName: item.snippet?.title ?? "",
    channelThumbnail: t?.default?.url ?? t?.medium?.url ?? t?.high?.url ?? null,
  };
}

async function channelsList(param: string): Promise<ResolvedChannel | null> {
  const res = await fetch(`${API}/channels?part=snippet&${param}&key=${key()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: ChannelSnippet[] };
  return toResolved(data.items?.[0]);
}

async function searchChannel(q: string): Promise<ResolvedChannel | null> {
  const res = await fetch(
    `${API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(q)}&key=${key()}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: { id?: { channelId?: string }; snippet?: ChannelSnippet["snippet"] }[];
  };
  const item = data.items?.[0];
  const channelId = item?.id?.channelId;
  if (!channelId) return null;
  return toResolved({ id: channelId, snippet: item?.snippet });
}

/** Resolves a YouTube channel from a URL, @handle, /user/ or free-text query. */
export async function resolveChannel(input: string): Promise<ResolvedChannel | null> {
  const { kind, value } = parseChannelInput(input);
  if (kind === "id") return channelsList(`id=${encodeURIComponent(value)}`);
  if (kind === "handle") {
    return (await channelsList(`forHandle=${encodeURIComponent(`@${value}`)}`)) ?? searchChannel(value);
  }
  if (kind === "username") {
    return (await channelsList(`forUsername=${encodeURIComponent(value)}`)) ?? searchChannel(value);
  }
  return searchChannel(value);
}

// ── Video sync helpers ───────────────────────────────────────────────────────

export interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string;
}

/** Maps each channelId → its "uploads" playlist id (batched, 50 ids per call). */
export async function getUploadsPlaylists(channelIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < channelIds.length; i += 50) {
    const chunk = channelIds.slice(i, i + 50);
    const res = await fetch(`${API}/channels?part=contentDetails&id=${chunk.join(",")}&key=${key()}`);
    if (!res.ok) continue;
    const data = (await res.json()) as {
      items?: { id?: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
    };
    for (const item of data.items ?? []) {
      const uploads = item.contentDetails?.relatedPlaylists?.uploads;
      if (item.id && uploads) map.set(item.id, uploads);
    }
  }
  return map;
}

interface PlaylistItem {
  snippet?: {
    title?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string }>;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
}

/** Newest uploads of a channel from its uploads playlist (cheap on quota). */
export async function getRecentUploads(playlistId: string, max = 10): Promise<PlaylistVideo[]> {
  const res = await fetch(
    `${API}/playlistItems?part=snippet,contentDetails&maxResults=${max}&playlistId=${playlistId}&key=${key()}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: PlaylistItem[] };
  return (data.items ?? [])
    .map((it) => {
      const sn = it.snippet ?? {};
      const t = sn.thumbnails ?? {};
      return {
        videoId: it.contentDetails?.videoId ?? sn.resourceId?.videoId ?? "",
        title: sn.title ?? "",
        thumbnail: t.medium?.url ?? t.high?.url ?? t.default?.url ?? null,
        publishedAt: it.contentDetails?.videoPublishedAt ?? sn.publishedAt ?? new Date().toISOString(),
      };
    })
    .filter((v) => v.videoId);
}

/** ISO 8601 duration (PT1H2M3S) → readable "1:02:03" / "12:34". */
export function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

/** Maps each videoId → readable duration (batched, 50 ids per call). */
export async function getDurations(videoIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const res = await fetch(`${API}/videos?part=contentDetails&id=${chunk.join(",")}&key=${key()}`);
    if (!res.ok) continue;
    const data = (await res.json()) as {
      items?: { id?: string; contentDetails?: { duration?: string } }[];
    };
    for (const item of data.items ?? []) {
      if (item.id) map.set(item.id, parseDuration(item.contentDetails?.duration ?? ""));
    }
  }
  return map;
}
