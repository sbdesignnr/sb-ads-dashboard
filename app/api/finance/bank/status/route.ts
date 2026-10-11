import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSaltEdgeConfigured } from "@/lib/salt-edge/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const connections = await prisma.bankConnection.findMany({
    include: { accounts: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ configured: isSaltEdgeConfigured(), connections });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // Historické transakcie ostávajú, len sa zruší napojenie na auto-sync.
  await prisma.financeAccount.updateMany({
    where: { connectionId: id },
    data: { connectionId: null, externalAccountId: null },
  });
  await prisma.bankConnection.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
