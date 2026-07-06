import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeAccount } from "@/lib/finance/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accounts = await prisma.financeAccount.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ accounts: accounts.map(serializeAccount) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; type?: string; currency?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const account = await prisma.financeAccount.create({
    data: {
      name,
      type: body.type === "business" ? "business" : "personal",
      currency: (body.currency ?? "EUR").toUpperCase(),
    },
  });
  return NextResponse.json({ account: serializeAccount(account) });
}
