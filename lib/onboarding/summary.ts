import { prisma } from "@/lib/prisma";
import {
  serializeProject,
  serializeClient,
  serializeChecklistItem,
  serializeQuestionnaire,
  serializeContract,
  serializeInvoice,
} from "./store";
import type { ProjectSummaryDTO } from "./types";

/** Kompletný prehľad projektu: projekt + klient + checklist + dotazník + zmluva + faktúry. */
export async function getProjectSummary(
  projectId: string,
): Promise<ProjectSummaryDTO | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { include: { _count: { select: { projects: true } } } },
      checklistItems: { orderBy: { order: "asc" } },
      questionnaire: true,
      contract: true,
      invoices: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!p) return null;

  return {
    project: serializeProject({
      ...p,
      client: { name: p.client.name, company: p.client.company },
      checklistItems: p.checklistItems,
      questionnaire: p.questionnaire,
    }),
    client: serializeClient(p.client),
    checklist: p.checklistItems.map(serializeChecklistItem),
    questionnaire: p.questionnaire
      ? serializeQuestionnaire(p.questionnaire)
      : null,
    contract: p.contract ? serializeContract(p.contract) : null,
    invoices: p.invoices.map(serializeInvoice),
  };
}
