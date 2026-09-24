import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildGreeting } from "@/lib/leads/person-name";
import { greetableOwnerName } from "@/lib/leads/owner-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Riadok oslovenia na začiatku mailu.
const GREETING_LINE_RE = /^(dobrý deň|dobrý večer|dobré ráno|vážen[ýá]|ahoj)\b/i;

/**
 * Oslovenie, ktoré má mať koncept podľa OVERENÉHO mena (alebo neutrálne
 * "Dobrý deň,"). Vráti nové telo alebo null, ak netreba meniť. Mení LEN prvý
 * riadok, takže ručné úpravy zvyšku konceptu ostanú.
 */
function correctedBody(
  body: string,
  lead: { ownerName: string | null; ownerSource: string | null },
): string | null {
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx < 0 || !GREETING_LINE_RE.test(lines[idx].trim())) return null;
  const expected = buildGreeting(greetableOwnerName(lead)).line;
  if (lines[idx].trim() === expected) return null;
  lines[idx] = expected;
  return lines.join("\n");
}

async function affected(segmentId?: string) {
  const emails = await prisma.leadEmail.findMany({
    where: {
      // Len neodoslané — odoslaný mail už zmeniť nejde.
      status: { in: ["draft", "approved"] },
      lead: segmentId ? { segmentId } : undefined,
    },
    include: { lead: { select: { ownerName: true, ownerSource: true } } },
  });
  return emails.flatMap((e) => {
    const body = e.body ? correctedBody(e.body, e.lead) : null;
    return body ? [{ id: e.id, body }] : [];
  });
}

/** GET — koľko neodoslaných konceptov má zlé/neoverené oslovenie (nič nemení). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seg = req.nextUrl.searchParams.get("segment");
  const list = await affected(seg && seg !== "all" ? seg : undefined);
  return NextResponse.json({ needFix: list.length });
}

/** POST — opraví oslovenie v neodoslaných konceptoch (iba prvý riadok). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* všetky segmenty */
  }
  const list = await affected(
    body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined,
  );
  for (const e of list)
    await prisma.leadEmail.update({ where: { id: e.id }, data: { body: e.body } });
  return NextResponse.json({ fixed: list.length });
}
