import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { sendLeadEmail } from "@/lib/leads/email-sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await sendLeadEmail(id);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
