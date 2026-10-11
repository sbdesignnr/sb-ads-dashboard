import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saltEdgeRequest } from "@/lib/salt-edge/client";
import { getOrCreateSaltEdgeCustomer } from "@/lib/salt-edge/customer";
import { syncBankConnection } from "@/lib/salt-edge/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ConnectionsListResponse {
  data: { id: string; provider_code: string; provider_name: string; created_at: string }[];
}
interface AccountsListResponse {
  data: { id: string; connection_id: string; name: string; nature: string }[];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const customerId = await getOrCreateSaltEdgeCustomer();
    const list = await saltEdgeRequest<ConnectionsListResponse>(`/connections?customer_id=${customerId}`);
    // Najnovšie vytvorené pripojenie = to, čo užívateľ práve dokončil vo widgete.
    const newest = [...list.data].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!newest) return NextResponse.redirect(new URL("/financie/nastavenia?bank=error", req.url));

    let bankConnection = await prisma.bankConnection.findUnique({ where: { connectionId: newest.id } });
    if (!bankConnection) {
      bankConnection = await prisma.bankConnection.create({
        data: { connectionId: newest.id, providerCode: newest.provider_code, providerName: newest.provider_name },
      });
    }

    const budgetAccount = await prisma.financeAccount.findFirst({ where: { isBudgetAccount: true } });
    if (budgetAccount && !budgetAccount.externalAccountId) {
      const accountsRes = await saltEdgeRequest<AccountsListResponse>(`/accounts?connection_id=${newest.id}`);
      const firstAccount = accountsRes.data[0];
      if (firstAccount) {
        await prisma.financeAccount.update({
          where: { id: budgetAccount.id },
          data: { connectionId: bankConnection.id, externalAccountId: firstAccount.id },
        });
      }
    }

    await syncBankConnection(bankConnection.id).catch((e) => console.error("Initial Salt Edge sync failed:", e));

    return NextResponse.redirect(new URL("/financie/nastavenia?bank=linked", req.url));
  } catch (err) {
    console.error("Salt Edge callback error:", err);
    return NextResponse.redirect(new URL("/financie/nastavenia?bank=error", req.url));
  }
}
