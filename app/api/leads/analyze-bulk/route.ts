import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enrichLead } from "@/lib/leads/scanner";
import { QUALIFY_AT } from "@/lib/leads/qualification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Koľko leadov analyzujeme na jedno volanie (klient volá v slučke, kým remaining>0).
// Leady bežia PARALELNE — enrichLead je väčšinou čakanie na sieť (PageSpeed ~30 s,
// AI), takže 6 naraz trvá takmer rovnako dlho ako 1. Headless prehliadač je
// v screenshot.ts obmedzený na 2 naraz (pamäť), zvyšok medzitým čaká na PageSpeed.
// Predtým sekvenčne ~50 s/lead → 1800 leadov ≈ 26 hodín.
const BATCH = 6;

// Tvrdý strop na celé volanie: radšej vrátiť odpoveď so zvyškom "čaká" než dostať
// od Vercelu 504 pri 300 s. Lead, ktorý sa nestihol, ostáva nezanalyzovaný
// (lastScannedAt null) a vezme sa v ďalšej dávke.
const DEADLINE_MS = 265_000;

const TIMED_OUT = Symbol("timed_out");

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Ešte nezanalyzované leady (akéhokoľvek zdroja — CSV import aj Google Places
// sken): majú web, nie sú zamietnuté a lastScannedAt je null (enrichLead ho
// vždy nastaví — úspech aj zlyhanie; POST /api/leads/reset-analysis ho vie
// zase vynulovať, aby sa lead dostal do frontu znova po oprave skórovania).
// Voliteľne obmedzené na jeden segment (nech sa dá analyzovať len ten, pre
// ktorý sa práve chystá kampaň, nie celá databáza naraz).
function pendingWhere(segmentId?: string): Prisma.LeadWhereInput {
  return {
    websiteUrl: { not: null },
    status: { not: "rejected" },
    lastScannedAt: null,
    ...(segmentId ? { segmentId } : {}),
  };
}

/**
 * GET — progres analýzy (poháňa ukazovateľ v UI). `?segment=<id>` obmedzí na
 * segment, `?since=<ISO>` je začiatok aktuálneho behu: vtedy vrátime aj koľko
 * leadov sa odvtedy dokončilo a koľko z nich je vhodných na oslovenie, takže
 * "X z Y" sa dá spočítať čisto z DB — prežije reload aj prechod na iný lead.
 * `now` je čas servera (klient ho použije ako `since`, bez rozdielu hodín).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seg = req.nextUrl.searchParams.get("segment");
  const segmentId = seg && seg !== "all" ? seg : undefined;
  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const scope: Prisma.LeadWhereInput = {
    websiteUrl: { not: null },
    ...(segmentId ? { segmentId } : {}),
  };
  const [remaining, doneSince, qualifiedSince] = await Promise.all([
    prisma.lead.count({ where: pendingWhere(segmentId) }),
    validSince
      ? prisma.lead.count({
          where: { ...scope, lastScannedAt: { gte: validSince } },
        })
      : Promise.resolve(null),
    validSince
      ? prisma.lead.count({
          where: {
            ...scope,
            lastScannedAt: { gte: validSince },
            websiteScore: { gte: QUALIFY_AT },
          },
        })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({
    remaining,
    doneSince,
    qualifiedSince,
    now: new Date().toISOString(),
  });
}

/** POST — zanalyzuje ďalšiu dávku importovaných leadov. `segmentId` v tele obmedzí na segment. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* bez tela — analyzuj naprieč všetkými segmentmi */
  }
  const segmentId =
    body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined;

  const leads = await prisma.lead.findMany({
    where: pendingWhere(segmentId),
    select: {
      id: true,
      segment: {
        select: { id: true, name: true, communicationStyle: true },
      },
    },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });

  const startedAt = Date.now();
  const outcomes = await Promise.all(
    leads.map(async (lead) => {
      const segment = lead.segment ?? {
        id: "",
        name: "",
        communicationStyle: null,
      };
      try {
        const res = await withDeadline(
          enrichLead(lead.id, segment),
          Math.max(5_000, DEADLINE_MS - (Date.now() - startedAt)),
        );
        // Nestihlo sa — lead ostáva čakať (lastScannedAt null), vezme sa nabudúce.
        if (res === TIMED_OUT) return { analyzed: false, qualified: false };
        return { analyzed: true, qualified: Boolean(res?.qualified) };
      } catch {
        // enrichLead si sám nastaví lastScannedAt aj pri zlyhaní analýzy, ale ak
        // by padlo skôr, označíme lead ako skenovaný, nech sa slučka nezacyklí.
        await prisma.lead
          .update({
            where: { id: lead.id },
            data: {
              disqualifyReason: "Analýza webu zlyhala — skús preanalyzovať.",
              lastScannedAt: new Date(),
            },
          })
          .catch(() => {});
        return { analyzed: true, qualified: false };
      }
    }),
  );

  const analyzed = outcomes.filter((o) => o.analyzed).length;
  const qualified = outcomes.filter((o) => o.qualified).length;

  const remaining = await prisma.lead.count({
    where: pendingWhere(segmentId),
  });
  return NextResponse.json({
    processed: leads.length,
    analyzed,
    qualified,
    remaining,
  });
}
