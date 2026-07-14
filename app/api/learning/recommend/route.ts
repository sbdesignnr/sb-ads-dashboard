import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recommendBooks } from "@/lib/learning/ai";
import { lookupBook } from "@/lib/learning/books";
import { serializeBook, bookKey } from "@/lib/learning/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// AI recommends N books tailored to Samuel + what he already has, grounds each in
// a real cover/ISBN, and saves them to the reading list (status "want").
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "AI nie je nakonfigurované." },
      { status: 503 },
    );

  let body: { focusAreas?: string[]; count?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }
  const focusAreas = Array.isArray(body.focusAreas)
    ? body.focusAreas.map(String)
    : [];
  const count = Math.min(Math.max(body.count ?? 5, 1), 8);

  const existing = await prisma.learningBook.findMany();
  const seen = new Set(existing.map((b) => bookKey(b.title)));

  const recs = await recommendBooks({
    alreadyHave: existing.map((b) => ({
      title: b.title,
      author: b.author,
      category: b.category,
      status: b.status,
    })),
    focusAreas,
    count,
  });

  const created = [];
  for (const r of recs) {
    if (seen.has(bookKey(r.title))) continue; // never duplicate what he already has
    seen.add(bookKey(r.title));
    // Ground the title/language in the real catalog — corrects the AI's guessed
    // translations and gives a real SK/CZ cover when a translation exists.
    const meta = await lookupBook(r.titleOriginal, r.author, {
      hintTitle: r.title,
      hintLanguage: r.language,
    }).catch(() => null);
    const displayTitle = meta?.title || r.title;
    const lang = meta?.resolvedLanguage ?? "en";
    const book = await prisma.learningBook.create({
      data: {
        title: displayTitle,
        originalTitle:
          lang !== "en" && r.titleOriginal !== displayTitle
            ? r.titleOriginal
            : null,
        language: lang,
        author: meta?.author || r.author,
        category: r.category,
        coverUrl: meta?.coverUrl ?? null,
        isbn: meta?.isbn ?? null,
        publishedYear: meta?.publishedYear ?? null,
        why: r.why,
        howToApply: r.howToApply,
        takeaways: r.takeaways,
        priority: r.priority,
        source: "ai",
      },
    });
    created.push(book);
  }

  return NextResponse.json({
    created: created.map(serializeBook),
    count: created.length,
  });
}
