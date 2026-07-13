import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fromDayKey, isDayKey } from "@/lib/todo/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/todo/tasks/move — hromadný presun úloh na iný deň.
 * Používa to tlačidlo "Presunúť všetko na dnes" pri úlohách po termíne.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { ids?: unknown; date?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ids = Array.isArray(b.ids)
    ? b.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (!ids.length)
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  if (!isDayKey(b.date))
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const { count } = await prisma.task.updateMany({
    where: { id: { in: ids } },
    data: { date: fromDayKey(b.date) },
  });

  return NextResponse.json({ moved: count });
}
