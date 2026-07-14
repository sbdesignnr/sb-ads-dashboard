import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeBook, bookKey } from "@/lib/learning/store";
import { lookupByTitle } from "@/lib/learning/books";
import { describeBook } from "@/lib/learning/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const books = await prisma.learningBook.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ books: books.map(serializeBook) });
}

// Manually add a specific book by title (any language): resolve its real cover +
// metadata, then have AI write the tailored why/how-to-apply.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { title?: string; author?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title)
    return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const meta = await lookupByTitle(
    title,
    body.author?.trim() || undefined,
  ).catch(() => null);
  const finalTitle = meta?.title || title;
  const finalAuthor = meta?.author || body.author?.trim() || "";

  // Don't add a duplicate of something already on the shelf.
  const dupe = (
    await prisma.learningBook.findMany({ select: { title: true } })
  ).find((b) => bookKey(b.title) === bookKey(finalTitle));
  if (dupe)
    return NextResponse.json(
      { error: "duplicate", message: "Túto knihu už v knižnici máš." },
      { status: 409 },
    );

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "AI nie je nakonfigurované." },
      { status: 503 },
    );
  const desc = await describeBook(finalTitle, finalAuthor).catch(() => null);
  if (!desc)
    return NextResponse.json({ error: "describe_failed" }, { status: 500 });

  // New manual books go to the front of the "next up" shelf.
  const minPriority =
    (await prisma.learningBook.aggregate({ _min: { priority: true } }))._min
      .priority ?? 1;

  const book = await prisma.learningBook.create({
    data: {
      title: finalTitle,
      author: finalAuthor,
      language: meta?.resolvedLanguage ?? null,
      coverUrl: meta?.coverUrl ?? null,
      isbn: meta?.isbn ?? null,
      publishedYear: meta?.publishedYear ?? null,
      category: desc.category,
      why: desc.why,
      howToApply: desc.howToApply,
      takeaways: desc.takeaways,
      priority: minPriority - 1,
      source: "manual",
    },
  });

  return NextResponse.json({
    book: serializeBook(book),
    foundCover: Boolean(meta?.coverUrl),
  });
}
