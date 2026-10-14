// Jednorazovo: prepíše neupravené initial koncepty (draft) na Norin schválený text
// (buildInitialOutreach). Ručne upravené koncepty a schválené/odoslané nechá.
// Run: npx tsx scripts/rewrite-drafts-nora.ts [--apply]   (bez --apply len vypíše, čo by zmenil)
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { buildInitialOutreach } from "../lib/leads/research/strategist";
import { isEditedByHand } from "../lib/leads/draft-state";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const drafts = await prisma.leadEmail.findMany({
    where: { emailType: "initial", status: "draft" },
    include: { lead: true },
  });
  let changed = 0, edited = 0, same = 0;
  for (const d of drafts) {
    if (isEditedByHand(d)) { edited++; console.log("PRESKOČENÉ (ručne upravené):", d.lead.companyName); continue; }
    const { subject, body } = buildInitialOutreach(d.lead);
    if (d.subject === subject && d.body === body) { same++; continue; }
    changed++;
    if (apply) await prisma.leadEmail.update({ where: { id: d.id }, data: { subject, body, createdAt: new Date() } });
  }
  console.log({ total: drafts.length, changed, edited, same, applied: apply });
}
main().finally(() => prisma.$disconnect());
