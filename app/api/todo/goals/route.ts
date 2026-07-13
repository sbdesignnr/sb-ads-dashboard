import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeGoal } from "@/lib/todo/store";
import {
  isPeriod,
  isPriority,
  isDayKey,
  periodKeyFor,
  toDayKey,
} from "@/lib/todo/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Postup cieľa sa počíta z naviazaných úloh — preto ich vždy načítame.
const withTasks = { tasks: { select: { done: true } } };

/**
 * GET /api/todo/goals?date=YYYY-MM-DD
 *
 * Ciele obdobia, do ktorého daný deň spadá (tento týždeň / mesiac / rok), plus
 * všetky ešte otvorené ciele z minulých období — nesplnený cieľ nesmie z pohľadu
 * vypadnúť len preto, že sa prevalil kalendár.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams.get("date");
  const day = isDayKey(p) ? p : toDayKey(new Date());

  const current = {
    week: periodKeyFor("week", day),
    month: periodKeyFor("month", day),
    year: periodKeyFor("year", day),
  };

  const goals = await prisma.goal.findMany({
    where: {
      OR: [
        // ciele aktuálneho obdobia (v akomkoľvek stave)
        { period: "week", periodKey: current.week },
        { period: "month", periodKey: current.month },
        { period: "year", periodKey: current.year },
        // + doťahované resty: aktívne ciele z už uzavretých období
        { status: "active", period: "week", periodKey: { lt: current.week } },
        { status: "active", period: "month", periodKey: { lt: current.month } },
        { status: "active", period: "year", periodKey: { lt: current.year } },
      ],
    },
    include: withTasks,
    orderBy: [{ periodKey: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ goals: goals.map(serializeGoal), current });
}

/** POST /api/todo/goals — nový cieľ. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = String(b.title ?? "").trim();
  if (!title)
    return NextResponse.json({ error: "missing_title" }, { status: 400 });
  if (!isPeriod(b.period))
    return NextResponse.json({ error: "invalid_period" }, { status: 400 });

  // Cieľ patrí do obdobia, v ktorom ho zakladáš — pokiaľ klient nepovie inak.
  const day = isDayKey(b.date) ? b.date : toDayKey(new Date());
  const periodKey =
    typeof b.periodKey === "string" && b.periodKey
      ? b.periodKey
      : periodKeyFor(b.period, day);

  const goal = await prisma.goal.create({
    data: {
      title,
      description: String(b.description ?? ""),
      period: b.period,
      periodKey,
      priority: isPriority(b.priority) ? b.priority : "normal",
    },
    include: withTasks,
  });

  return NextResponse.json({ goal: serializeGoal(goal) }, { status: 201 });
}
