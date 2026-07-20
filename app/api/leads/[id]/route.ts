import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLead, serializeLeadEmail } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "responded", "rejected", "converted"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const segment = lead.segmentId
    ? await prisma.leadSegment.findUnique({ where: { id: lead.segmentId } })
    : null;
  const emails = await prisma.leadEmail.findMany({
    where: { leadId: id },
    include: { lead: { include: { segment: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    lead: serializeLead(lead),
    segmentName: segment?.name ?? null,
    emails: emails.map(serializeLeadEmail),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: {
    status?: string;
    notes?: string;
    companyEmail?: string;
    companyPhone?: string;
    ownerName?: string;
    ownerPosition?: string;
    ico?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const data: {
    status?: string;
    notes?: string;
    companyEmail?: string | null;
    companyPhone?: string | null;
    ownerName?: string | null;
    ownerPosition?: string | null;
    ico?: string | null;
  } = {};
  if (typeof body.status === "string" && STATUSES.includes(body.status))
    data.status = body.status;
  if (typeof body.notes === "string") data.notes = body.notes;
  // Contact fields: trim and treat an empty string as clearing the value (null).
  if (typeof body.companyEmail === "string")
    data.companyEmail = body.companyEmail.trim() || null;
  if (typeof body.companyPhone === "string")
    data.companyPhone = body.companyPhone.trim() || null;
  if (typeof body.ownerName === "string")
    data.ownerName = body.ownerName.trim() || null;
  if (typeof body.ownerPosition === "string")
    data.ownerPosition = body.ownerPosition.trim() || null;
  if (typeof body.ico === "string")
    data.ico = body.ico.replace(/\D/g, "") || null;
  try {
    const lead = await prisma.lead.update({ where: { id }, data });
    return NextResponse.json({ lead: serializeLead(lead) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
