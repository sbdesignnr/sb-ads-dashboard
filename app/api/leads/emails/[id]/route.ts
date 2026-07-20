import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLeadEmail } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

// Edit an email's subject and/or body (from the queue editor).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: {
    subject?: string;
    body?: string;
    status?: string;
    scheduledAt?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: {
    subject?: string;
    body?: string;
    status?: string;
    scheduledAt?: Date | null;
  } = {};
  if (typeof body.subject === "string") data.subject = body.subject.trim();
  if (typeof body.body === "string") data.body = body.body;
  // Move an approved e-mail back to drafts (or re-approve) — a typo caught after
  // approving must not mean the e-mail is stuck waiting to send.
  if (body.status === "draft" || body.status === "approved")
    data.status = body.status;
  // Naplánovaný čas odoslania: ISO reťazec (klient posiela .toISOString()), alebo
  // null/"" na zrušenie plánu (potom sa mail riadi denným časom kampane).
  if ("scheduledAt" in body) {
    if (body.scheduledAt === null || body.scheduledAt === "") {
      data.scheduledAt = null;
    } else {
      const d = new Date(body.scheduledAt as string);
      if (Number.isNaN(d.getTime()))
        return NextResponse.json(
          { error: "invalid_scheduledAt" },
          { status: 400 },
        );
      data.scheduledAt = d;
    }
  }
  try {
    const email = await prisma.leadEmail.update({
      where: { id },
      data,
      include: { lead: { include: { segment: { select: { name: true } } } } },
    });
    return NextResponse.json({ email: serializeLeadEmail(email) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
