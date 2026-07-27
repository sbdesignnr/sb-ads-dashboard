import type {
  Client,
  Project,
  ChecklistItem,
  Invoice,
  Contract,
  Questionnaire,
} from "@prisma/client";
import type {
  ClientDTO,
  ProjectDTO,
  ChecklistItemDTO,
  InvoiceDTO,
  ContractDTO,
  QuestionnaireDTO,
} from "./types";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function serializeClient(
  c: Client & { _count?: { projects: number } },
): ClientDTO {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    address: c.address,
    ico: c.ico,
    dic: c.dic,
    note: c.note,
    projectCount: c._count?.projects ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

type ProjectWithRels = Project & {
  client?: Pick<Client, "name" | "company"> | null;
  checklistItems?: { completed: boolean }[];
  questionnaire?: { completedAt: Date | null } | null;
};

export function serializeProject(p: ProjectWithRels): ProjectDTO {
  const items = p.checklistItems ?? [];
  return {
    id: p.id,
    clientId: p.clientId,
    clientName: p.client?.name ?? "—",
    clientCompany: p.client?.company ?? "—",
    name: p.name,
    type: p.type,
    status: p.status,
    price: p.price ? p.price.toNumber() : null,
    depositAmount: p.depositAmount ? p.depositAmount.toNumber() : null,
    depositPaid: p.depositPaid,
    finalPaid: p.finalPaid,
    startDate: iso(p.startDate),
    deadline: iso(p.deadline),
    launchDate: iso(p.launchDate),
    notes: p.notes,
    checklistTotal: items.length,
    checklistDone: items.filter((i) => i.completed).length,
    questionnaireDone: Boolean(p.questionnaire?.completedAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeChecklistItem(i: ChecklistItem): ChecklistItemDTO {
  return {
    id: i.id,
    projectId: i.projectId,
    step: i.step,
    title: i.title,
    completed: i.completed,
    completedAt: iso(i.completedAt),
    dueDate: iso(i.dueDate),
    notes: i.notes,
    order: i.order,
  };
}

export function serializeInvoice(i: Invoice): InvoiceDTO {
  return {
    id: i.id,
    projectId: i.projectId,
    type: i.type as InvoiceDTO["type"],
    amount: i.amount.toNumber(),
    dueDate: i.dueDate.toISOString(),
    paidAt: iso(i.paidAt),
    status: i.status as InvoiceDTO["status"],
    createdAt: i.createdAt.toISOString(),
  };
}

export function serializeContract(c: Contract): ContractDTO {
  return {
    id: c.id,
    projectId: c.projectId,
    token: c.token,
    content: c.content,
    signedAt: iso(c.signedAt),
    signedByName: c.signedByName,
    status: c.status as ContractDTO["status"],
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeQuestionnaire(q: Questionnaire): QuestionnaireDTO {
  return {
    id: q.id,
    projectId: q.projectId,
    token: q.token,
    completedAt: iso(q.completedAt),
    businessDescription: q.businessDescription,
    idealCustomer: q.idealCustomer,
    uniqueValue: q.uniqueValue,
    websiteGoal: q.websiteGoal,
    brandWords: q.brandWords,
    primaryColor: q.primaryColor,
    secondaryColor: q.secondaryColor,
    inspirationUrls: q.inspirationUrls,
    antiInspirationUrls: q.antiInspirationUrls,
    hasLogo: q.hasLogo,
    hasPhotos: q.hasPhotos,
    hasTexts: q.hasTexts,
    requiredSections: q.requiredSections,
    specialFeatures: q.specialFeatures,
    languages: q.languages,
    cmsNeeded: q.cmsNeeded,
    specialRequirements: q.specialRequirements,
    externalIntegrations: q.externalIntegrations,
    bookingNeeded: q.bookingNeeded,
    bookingCurrentProcess: q.bookingCurrentProcess,
    budget: q.budget,
    deadline: q.deadline,
    additionalInfo: q.additionalInfo,
    maintenanceInterest: q.maintenanceInterest,
    seoInterest: q.seoInterest,
    adsInterest: q.adsInterest,
    monthlyAdsBudget: q.monthlyAdsBudget,
  };
}

/** Predvolený onboarding checklist — 12 krokov, vytvorí sa pri novom projekte. */
export const DEFAULT_CHECKLIST: { step: string; title: string }[] = [
  { step: "discovery", title: "Discovery call" },
  { step: "proposal", title: "Cenová ponuka odoslaná" },
  { step: "contract", title: "Zmluva podpísaná" },
  { step: "deposit", title: "Záloha 30 % zaplatená" },
  { step: "welcome", title: "Welcome doc odoslaný" },
  { step: "questionnaire", title: "Dotazník vyplnený" },
  { step: "design", title: "Dizajn schválený" },
  { step: "development", title: "Vývoj dokončený" },
  { step: "review", title: "Finálne schválenie" },
  { step: "launch", title: "Web spustený + prístupy odovzdané" },
  { step: "invoice", title: "Záverečná faktúra zaplatená" },
  { step: "feedback", title: "Feedback request odoslaný" },
];
