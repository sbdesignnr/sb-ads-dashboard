import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brevo transactional webhook. Matches events to a lead_email by brevo message id.
// Configure in Brevo → Settings → Webhooks → Transactional:
//   https://ads.sbdesign.sk/api/webhooks/brevo
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = String(body.event ?? "").toLowerCase();
  const messageId = String(body["message-id"] ?? body.message_id ?? body.messageId ?? "").trim();
  if (!messageId || !event) return NextResponse.json({ ok: true });

  const email = await prisma.leadEmail.findFirst({ where: { brevoMessageId: messageId } });
  if (!email) return NextResponse.json({ ok: true });

  const now = new Date();
  if (["opened", "unique_opened", "click", "clicked"].includes(event)) {
    if (!email.openedAt) await prisma.leadEmail.update({ where: { id: email.id }, data: { openedAt: now } });
  } else if (event.includes("bounce") || ["blocked", "invalid_email", "error", "deferred"].includes(event)) {
    await prisma.leadEmail.update({ where: { id: email.id }, data: { status: "failed" } });
    const lead = await prisma.lead.findUnique({ where: { id: email.leadId }, select: { notes: true } });
    await prisma.lead.update({
      where: { id: email.leadId },
      data: { notes: `${lead?.notes ? lead.notes + "\n" : ""}Email doručovanie zlyhalo (${event}).` },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
