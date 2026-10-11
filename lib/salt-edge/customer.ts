import { prisma } from "@/lib/prisma";
import { saltEdgeRequest } from "./client";

interface CreateCustomerResponse {
  data: { id: string; identifier: string };
}

/** Jeden Salt Edge zákazník reprezentuje nás (singleton, id = "primary"). */
export async function getOrCreateSaltEdgeCustomer(): Promise<string> {
  const existing = await prisma.saltEdgeCustomer.findUnique({ where: { id: "primary" } });
  if (existing) return existing.customerId;

  const res = await saltEdgeRequest<CreateCustomerResponse>("/customers", {
    method: "POST",
    body: { data: { identifier: "sb-design-financie" } },
  });

  await prisma.saltEdgeCustomer.create({
    data: { id: "primary", customerId: res.data.id },
  });
  return res.data.id;
}
