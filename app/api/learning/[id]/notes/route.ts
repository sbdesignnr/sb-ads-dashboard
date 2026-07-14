import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeNote } from "@/lib/learning/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learning/[id]/notes — kapitoly knihy v poradí. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const notes = await prisma.bookNote.findMany({
    where: { bookId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ notes: notes.map(serializeNote) });
}

/** POST /api/learning/[id]/notes — nová kapitola (na koniec zoznamu). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let b: { title?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    /* prázdne telo je v poriadku — kapitola dostane predvolený názov */
  }

  const book = await prisma.learningBook.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!book)
    return NextResponse.json({ error: "book_not_found" }, { status: 404 });

  const last = await prisma.bookNote.aggregate({
    where: { bookId: id },
    _max: { sortOrder: true },
  });
  const count = await prisma.bookNote.count({ where: { bookId: id } });

  const note = await prisma.bookNote.create({
    data: {
      bookId: id,
      title: String(b.title ?? "").trim() || `Kapitola ${count + 1}`,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}
