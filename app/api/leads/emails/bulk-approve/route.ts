import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFollowUps } from "@/lib/leads/email-sender";

export const dynamic = "force-dynamic";

// Approve many emails at once; queue follow-ups for any approved initial emails.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { emailIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.emailIds) ? body.emailIds.filter((x) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ approved: 0 });

  const emails = await prisma.leadEmail.findMany({ where: { id: { in: ids } }, select: { id: true, leadId: true, emailType: true } });
  await prisma.leadEmail.updateMany({ where: { id: { in: ids } }, data: { status: "approved" } });
  for (const e of emails) {
    if (e.emailType === "initial") await scheduleFollowUps(e.leadId, e.id).catch(() => {});
  }
  return NextResponse.json({ approved: emails.length });
}
