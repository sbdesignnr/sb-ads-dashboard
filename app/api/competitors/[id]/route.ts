import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getCompetitorDetail } from "@/lib/competitors/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const competitor = await getCompetitorDetail(id);
  if (!competitor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ competitor });
}
