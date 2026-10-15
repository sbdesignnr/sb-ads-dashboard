import { prisma } from "@/lib/prisma";
import { saltEdgeRequest, SaltEdgeError } from "./client";

const IDENTIFIER = "sb-design-financie";

// Salt Edge v6 vracia id zákazníka v poli `customer_id` (nie `id`).
interface SaltEdgeCustomerRow {
  customer_id: string;
  identifier: string;
}

async function findCustomerId(): Promise<string | null> {
  const res = await saltEdgeRequest<{ data: SaltEdgeCustomerRow[] }>("/customers");
  return res.data.find((c) => c.identifier === IDENTIFIER)?.customer_id ?? null;
}

/** Jeden Salt Edge zákazník reprezentuje nás (singleton, id = "primary"). */
export async function getOrCreateSaltEdgeCustomer(): Promise<string> {
  const existing = await prisma.saltEdgeCustomer.findUnique({ where: { id: "primary" } });
  if (existing) return existing.customerId;

  let customerId: string | null = null;
  try {
    const res = await saltEdgeRequest<{ data: SaltEdgeCustomerRow }>("/customers", {
      method: "POST",
      body: { data: { identifier: IDENTIFIER } },
    });
    customerId = res.data.customer_id;
  } catch (e) {
    // Zákazník už v Salt Edge existuje (napr. predošlý pokus, ktorý sa nestihol uložiť lokálne).
    if (e instanceof SaltEdgeError && e.status === 409) customerId = await findCustomerId();
    else throw e;
  }
  if (!customerId) throw new Error("Salt Edge zákazník sa nepodarilo zistiť.");

  await prisma.saltEdgeCustomer.upsert({
    where: { id: "primary" },
    create: { id: "primary", customerId },
    update: { customerId },
  });
  return customerId;
}
