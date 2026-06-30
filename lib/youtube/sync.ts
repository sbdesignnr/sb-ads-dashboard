import { prisma } from "@/lib/prisma";
import {
  youtubeConfigured,
  getUploadsPlaylists,
  getRecentUploads,
  getDurations,
} from "./client";

export interface SyncResult {
  added: number;
  updated: number;
  channels: number;
  error?: string;
}

const PER_CHANNEL = 10;

/**
 * For every tracked channel, fetch its newest uploads (via the uploads playlist
 * — cheap on quota), enrich with durations, and upsert into youtube_videos
 * (dedupe by video_id; watched/saved flags are preserved on update).
 */
export async function syncAllChannels(): Promise<SyncResult> {
  if (!youtubeConfigured()) return { added: 0, updated: 0, channels: 0, error: "missing_api_key" };

  const channels = await prisma.youtubeChannel.findMany();
  if (channels.length === 0) return { added: 0, updated: 0, channels: 0 };

  const uploads = await getUploadsPlaylists(channels.map((c) => c.channelId));

  const candidates: { videoId: string; channelId: string; title: string; thumbnail: string | null; publishedAt: string }[] = [];
  for (const ch of channels) {
    const playlist = uploads.get(ch.channelId);
    if (!playlist) continue;
    const vids = await getRecentUploads(playlist, PER_CHANNEL);
    for (const v of vids) candidates.push({ ...v, channelId: ch.channelId });
  }

  // Drop deleted/private placeholder items.
  const valid = candidates.filter(
    (v) => v.title && v.title !== "Deleted video" && v.title !== "Private video",
  );
  if (valid.length === 0) return { added: 0, updated: 0, channels: channels.length };

  const durations = await getDurations(valid.map((v) => v.videoId));

  const ids = valid.map((v) => v.videoId);
  const existing = await prisma.youtubeVideo.findMany({
    where: { videoId: { in: ids } },
    select: { videoId: true },
  });
  const existingSet = new Set(existing.map((e) => e.videoId));

  const fresh = valid.filter((v) => !existingSet.has(v.videoId));
  const stale = valid.filter((v) => existingSet.has(v.videoId));

  if (fresh.length) {
    await prisma.youtubeVideo.createMany({
      data: fresh.map((v) => ({
        videoId: v.videoId,
        channelId: v.channelId,
        title: v.title,
        thumbnail: v.thumbnail,
        publishedAt: new Date(v.publishedAt),
        duration: durations.get(v.videoId) || null,
      })),
      skipDuplicates: true,
    });
  }

  for (const v of stale) {
    await prisma.youtubeVideo.update({
      where: { videoId: v.videoId },
      data: {
        title: v.title,
        thumbnail: v.thumbnail,
        publishedAt: new Date(v.publishedAt),
        duration: durations.get(v.videoId) || null,
      },
    });
  }

  return { added: fresh.length, updated: stale.length, channels: channels.length };
}
