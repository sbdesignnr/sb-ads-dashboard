import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeAccount } from "@/lib/finance/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { isBudgetAccount?: boolean; name?: string; type?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const account = await prisma.financeAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: { isBudgetAccount?: boolean; name?: string; type?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.type === "business" || body.type === "personal") data.type = body.type;

  if (typeof body.isBudgetAccount === "boolean") {
    if (body.isBudgetAccount) {
      // Presne jeden účet kŕmi vrecká naraz — atomicky vypni na ostatných.
      await prisma.$transaction([
        prisma.financeAccount.updateMany({ where: { id: { not: id } }, data: { isBudgetAccount: false } }),
        prisma.financeAccount.update({ where: { id }, data: { ...data, isBudgetAccount: true } }),
      ]);
      const updated = await prisma.financeAccount.findUniqueOrThrow({ where: { id } });
      return NextResponse.json({ account: serializeAccount(updated) });
    }
    data.isBudgetAccount = false;
  }

  const updated = await prisma.financeAccount.update({ where: { id }, data });
  return NextResponse.json({ account: serializeAccount(updated) });
}
