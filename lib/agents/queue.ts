// Jednotné definície "čo čaká na človeka", aby sa čísla v mape, v prehľade aj v postupe zhodovali.
import type { Prisma } from "@prisma/client";

/** Koncepty mailov na schválenie: prvé maily, a follow-upy hotové a splatné do 3 dní. */
export function draftsWaitingWhere(now = Date.now()): Prisma.LeadEmailWhereInput {
  return {
    status: "draft",
    body: { not: "" },
    OR: [
      { emailType: "initial" },
      { emailType: { not: "initial" }, scheduledAt: { lte: new Date(now + 3 * 24 * 3_600_000) } },
    ],
  };
}

/** Hotové ponuky Nory, ktoré čakajú na posúdenie (ešte nie sú konceptom). */
export const researchReadyWhere: Prisma.LeadResearchWhereInput = {
  status: "done",
  appliedAt: null,
  emailBody: { not: null },
};

/** Odbory, v ktorých sa hľadajú príležitosti (na zobrazenie človeku). */
export const PRIORITY_LABEL = "realitné kancelárie, stavebné firmy, fyzioterapeuti";
