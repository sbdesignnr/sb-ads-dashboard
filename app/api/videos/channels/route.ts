import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveChannel, YouTubeNotConfiguredError } from "@/lib/youtube/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string | null;
  categoryId: string | null;
  addedAt: Date;
}

function serialize(c: ChannelRow) {
  return {
    id: c.id,
    channelId: c.channelId,
    channelName: c.channelName,
    channelThumbnail: c.channelThumbnail,
    categoryId: c.categoryId,
    addedAt: c.addedAt.toISOString(),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const channels = await prisma.youtubeChannel.findMany({ orderBy: { addedAt: "desc" } });
  return NextResponse.json({ channels: channels.map(serialize) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { input?: string; categoryId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const input = (body.input ?? "").trim();
  if (!input) return NextResponse.json({ error: "missing_input" }, { status: 400 });

  let resolved;
  try {
    resolved = await resolveChannel(input);
  } catch (e) {
    if (e instanceof YouTubeNotConfiguredError) {
      return NextResponse.json(
        { error: "YouTube API nie je nakonfigurované (chýba YOUTUBE_API_KEY)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!resolved) {
    return NextResponse.json({ error: "Kanál sa nenašiel. Skús inú URL alebo @handle." }, { status: 404 });
  }

  const categoryId =
    typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;

  const channel = await prisma.youtubeChannel.upsert({
    where: { channelId: resolved.channelId },
    update: {
      channelName: resolved.channelName,
      channelThumbnail: resolved.channelThumbnail,
      ...(categoryId !== null ? { categoryId } : {}),
    },
    create: {
      channelId: resolved.channelId,
      channelName: resolved.channelName,
      channelThumbnail: resolved.channelThumbnail,
      categoryId,
    },
  });

  return NextResponse.json({ channel: serialize(channel) });
}
