import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeNote } from "@/lib/learning/store";
import { sanitizeNoteHtml } from "@/lib/learning/sanitize";
import { notesFromPhotos, type PhotoInput } from "@/lib/learning/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Opus vision nad 15 fotkami môže trvať vyše minúty

const MAX_PHOTOS = 15;
const ALLOWED: Record<string, PhotoInput["mediaType"]> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/**
 * POST /api/learning/[id]/notes/from-photos  (multipart/form-data)
 *   fields: photos[] (obrázky), title? (voliteľná téma/kapitola)
 *
 * Claude vision prečíta zvýraznené pasáže na fotkách strán knihy a vytvorí
 * premakané poznámky. Uloží ich ako novú kapitolu (BookNote) a vráti ju.
 * Fotky sa NEUKLADAJÚ — hodnota je vygenerovaná poznámka.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI nie je nakonfigurované." },
      { status: 503 },
    );
  }
  const { id } = await ctx.params;

  const book = await prisma.learningBook.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!book)
    return NextResponse.json({ error: "book_not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const chapterHint = String(form.get("title") ?? "").trim();
  const files = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length)
    return NextResponse.json({ error: "no_photos" }, { status: 400 });
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: "too_many", message: `Maximálne ${MAX_PHOTOS} fotiek naraz.` },
      { status: 400 },
    );
  }

  // Súbory → base64 pre Claude. Nepodporovaný typ preskočíme.
  const photos: PhotoInput[] = [];
  for (const f of files) {
    const mediaType = ALLOWED[f.type.toLowerCase()];
    if (!mediaType) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    photos.push({ mediaType, data: buf.toString("base64") });
  }
  if (!photos.length) {
    return NextResponse.json(
      {
        error: "unsupported",
        message: "Nepodporovaný formát fotiek (použi JPG/PNG).",
      },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await notesFromPhotos(photos, book.title, chapterHint);
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  const last = await prisma.bookNote.aggregate({
    where: { bookId: id },
    _max: { sortOrder: true },
  });
  const note = await prisma.bookNote.create({
    data: {
      bookId: id,
      title: (chapterHint || result.title || "Poznámky z fotiek").slice(0, 200),
      content: sanitizeNoteHtml(result.html),
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}
