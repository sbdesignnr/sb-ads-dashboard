import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLeadEmail } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

// Edit an email's subject and/or body (from the queue editor).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { subject?: string; body?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: { subject?: string; body?: string } = {};
  if (typeof body.subject === "string") data.subject = body.subject.trim();
  if (typeof body.body === "string") data.body = body.body;
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
