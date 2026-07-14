import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeBook } from "@/lib/learning/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["want", "reading", "read", "skipped"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { status?: string; notes?: string; rating?: number | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (
    typeof body.status === "string" &&
    STATUSES.includes(body.status as (typeof STATUSES)[number])
  ) {
    data.status = body.status;
    // Stamp the reading timeline as the status moves.
    if (body.status === "reading") data.startedAt = new Date();
    if (body.status === "read") data.finishedAt = new Date();
    if (body.status === "want") {
      data.startedAt = null;
      data.finishedAt = null;
    }
  }
  if (typeof body.notes === "string") data.notes = body.notes;
  if (
    body.rating === null ||
    (typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5)
  ) {
    data.rating = body.rating;
  }

  try {
    const book = await prisma.learningBook.update({ where: { id }, data });
    return NextResponse.json({ book: serializeBook(book) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.learningBook.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
