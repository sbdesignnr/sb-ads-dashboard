import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findEmailForLead } from "@/lib/leads/email-finder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// On-demand email discovery for a single lead (scrapes the site + Jina fallback).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const email = await findEmailForLead(lead.websiteUrl, lead.companyName).catch(() => null);
  if (!email) return NextResponse.json({ found: false });

  await prisma.lead.update({ where: { id }, data: { companyEmail: email } });
  return NextResponse.json({ found: true, email });
}
