import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const chats = await prisma.aiChatHistory.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
      take: 100,
    });
    return NextResponse.json({
      chats: chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })),
    });
  } catch {
    return NextResponse.json({ chats: [] });
  }
}
