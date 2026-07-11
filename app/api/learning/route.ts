import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeBook } from "@/lib/learning/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const books = await prisma.learningBook.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ books: books.map(serializeBook) });
}
