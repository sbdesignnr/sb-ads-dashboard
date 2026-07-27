// DTOs for the Client Onboarding / Project Management module.

export type ProjectType = "web" | "eshop" | "marketing" | "other";

export type ProjectStatus =
  | "discovery"
  | "proposal"
  | "contract"
  | "onboarding"
  | "design"
  | "development"
  | "review"
  | "launch"
  | "completed";

export type ChecklistStep =
  | "discovery"
  | "proposal"
  | "contract"
  | "deposit"
  | "welcome"
  | "questionnaire"
  | "design"
  | "development"
  | "review"
  | "launch"
  | "invoice"
  | "feedback";

export interface ClientDTO {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  address: string | null;
  ico: string | null;
  dic: string | null;
  note: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItemDTO {
  id: string;
  projectId: string;
  step: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null;
  notes: string | null;
  order: number;
}

export interface InvoiceDTO {
  id: string;
  projectId: string;
  type: "deposit" | "final" | "other";
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: "unpaid" | "paid" | "overdue";
  createdAt: string;
}

export interface ContractDTO {
  id: string;
  projectId: string;
  token: string;
  content: string;
  signedAt: string | null;
  signedByName: string | null;
  status: "draft" | "sent" | "signed";
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  clientId: string;
  clientName: string;
  clientCompany: string;
  name: string;
  type: string;
  status: string;
  price: number | null;
  depositAmount: number | null;
  depositPaid: boolean;
  finalPaid: boolean;
  startDate: string | null;
  deadline: string | null;
  launchDate: string | null;
  notes: string | null;
  checklistTotal: number;
  checklistDone: number;
  questionnaireDone: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireDTO {
  id: string;
  projectId: string;
  token: string;
  completedAt: string | null;
  businessDescription: string | null;
  idealCustomer: string | null;
  uniqueValue: string | null;
  websiteGoal: string | null;
  brandWords: string[];
  primaryColor: string | null;
  secondaryColor: string | null;
  inspirationUrls: string[];
  antiInspirationUrls: string[];
  hasLogo: boolean | null;
  hasPhotos: string | null;
  hasTexts: string | null;
  requiredSections: string[];
  specialFeatures: string[];
  languages: string[];
  cmsNeeded: string | null;
  specialRequirements: string | null;
  externalIntegrations: string[];
  bookingNeeded: string | null;
  bookingCurrentProcess: string | null;
  budget: string | null;
  deadline: string | null;
  additionalInfo: string | null;
  maintenanceInterest: string | null;
  seoInterest: string | null;
  adsInterest: string | null;
  monthlyAdsBudget: string | null;
}

export interface ProjectSummaryDTO {
  project: ProjectDTO;
  client: ClientDTO;
  checklist: ChecklistItemDTO[];
  questionnaire: QuestionnaireDTO | null;
  contract: ContractDTO | null;
  invoices: InvoiceDTO[];
}

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "discovery", label: "Discovery" },
  { value: "proposal", label: "Ponuka" },
  { value: "contract", label: "Zmluva" },
  { value: "onboarding", label: "Onboarding" },
  { value: "design", label: "Dizajn" },
  { value: "development", label: "Vývoj" },
  { value: "review", label: "Review" },
  { value: "launch", label: "Spustenie" },
  { value: "completed", label: "Dokončené" },
];

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  web: "Web",
  eshop: "E-shop",
  marketing: "Marketing",
  other: "Iné",
};
