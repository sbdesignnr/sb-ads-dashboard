import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncBankConnection } from "@/lib/enable-banking/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron (Bearer CRON_SECRET) alebo prihlásený používateľ (manuálne tlačidlo).
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const connections = await prisma.bankConnection.findMany({ where: { status: "active" } });
  const results: { connectionId: string; imported?: number; error?: string }[] = [];

  for (const c of connections) {
    try {
      const r = await syncBankConnection(c.id);
      results.push({ connectionId: c.id, imported: r.imported });
    } catch (e) {
      console.error(`[cron/bank-sync] connection ${c.id} failed:`, (e as Error).message);
      results.push({ connectionId: c.id, error: (e as Error).message });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}

export const GET = handle;
export const POST = handle;
