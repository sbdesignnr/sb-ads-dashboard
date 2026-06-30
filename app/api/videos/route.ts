import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const category = sp.get("category"); // categoryId | "all" | "none"
  const filter = sp.get("filter"); // "unwatched" | "all" | "saved"

  const where: Prisma.YoutubeVideoWhereInput = {};
  if (filter === "unwatched") where.watched = false;
  else if (filter === "saved") where.saved = true;
  if (category && category !== "all") {
    where.channel = { categoryId: category === "none" ? null : category };
  }

  const videos = await prisma.youtubeVideo.findMany({
    where,
    include: { channel: true },
    orderBy: { publishedAt: "desc" },
    take: 300,
  });

  return NextResponse.json({
    videos: videos.map((v) => ({
      id: v.id,
      videoId: v.videoId,
      channelId: v.channelId,
      channelName: v.channel.channelName,
      channelThumbnail: v.channel.channelThumbnail,
      categoryId: v.channel.categoryId,
      title: v.title,
      thumbnail: v.thumbnail,
      publishedAt: v.publishedAt.toISOString(),
      duration: v.duration,
      watched: v.watched,
      saved: v.saved,
    })),
  });
}
