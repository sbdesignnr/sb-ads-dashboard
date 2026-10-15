import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enableBankingRequest } from "@/lib/enable-banking/client";
import { psuTypeFromState } from "@/lib/enable-banking/connect";
import { syncBankConnection } from "@/lib/enable-banking/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SessionResponse {
  session_id: string;
  accounts: {
    uid: string;
    account_id?: { iban?: string | null } | null;
    name?: string | null;
    usage?: string | null; // PRIV | ORGA
  }[];
  access?: { valid_until?: string };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  if (!code) return NextResponse.redirect(new URL("/financie/nastavenia?bank=error", req.url));

  try {
    const stateType = psuTypeFromState(params.get("state"));
    const s = await enableBankingRequest<SessionResponse>("/sessions", { method: "POST", body: { code } });

    const validUntil = s.access?.valid_until ? new Date(s.access.valid_until) : new Date(Date.now() + 179 * 86_400_000);
    const bankConnection = await prisma.bankConnection.upsert({
      where: { connectionId: s.session_id },
      create: { connectionId: s.session_id, providerCode: "SLSP", providerName: "Slovenská sporiteľňa", validUntil },
      update: { status: "active", validUntil },
    });

    // Každý účet z banky sa priradí lokálnemu podľa typu (ORGA = podnikateľský, PRIV = osobný);
    // ak banka typ neuvedie, platí typ, ktorý si užívateľ zvolil pri pripájaní.
    for (const acc of s.accounts) {
      const type = acc.usage === "ORGA" ? "business" : acc.usage === "PRIV" ? "personal" : stateType;
      const local = await prisma.financeAccount.findFirst({ where: { type } });
      if (!local) continue;
      await prisma.financeAccount.update({
        where: { id: local.id },
        data: { connectionId: bankConnection.id, externalAccountId: acc.uid },
      });
    }

    await syncBankConnection(bankConnection.id).catch((e) => console.error("Initial bank sync failed:", e));
    return NextResponse.redirect(new URL("/financie/nastavenia?bank=linked", req.url));
  } catch (err) {
    console.error("Enable Banking callback error:", err);
    return NextResponse.redirect(new URL("/financie/nastavenia?bank=error", req.url));
  }
}
