import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeNote } from "@/lib/learning/store";
import { sanitizeNoteHtml } from "@/lib/learning/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/learning/notes/[noteId] — názov kapitoly, obsah alebo poradie. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ noteId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { noteId } = await ctx.params;

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof b.title === "string" && b.title.trim())
    data.title = b.title.trim().slice(0, 200);
  // Obsah ide z editora, ale prejde cez filter — do stĺpca sa nikdy nedostane
  // nič, čo by sa pri vykreslení mohlo spustiť.
  if (typeof b.content === "string") data.content = sanitizeNoteHtml(b.content);
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) {
    data.sortOrder = Math.round(b.sortOrder);
  }

  if (!Object.keys(data).length)
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  try {
    const note = await prisma.bookNote.update({ where: { id: noteId }, data });
    return NextResponse.json({ note: serializeNote(note) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

/** DELETE /api/learning/notes/[noteId] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ noteId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { noteId } = await ctx.params;
  try {
    await prisma.bookNote.delete({ where: { id: noteId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
