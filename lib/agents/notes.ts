// Pamäť agentov (tabuľka agent_notes): odôvodnenia leadov, záznamy skenov, spätná väzba,
// lekcie a novinky z AI. Všetko je "best effort": ak tabuľka neexistuje, funkcie vrátia prázdno
// a nič sa nerozbije. Autonómne behy Skauta sa bez tabuľky nespúšťajú (pozri notesAvailable).
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NoteKind = "verdict" | "scan" | "sweep" | "feedback" | "lesson" | "news" | "email-search";

/** Klient databázy (bežný alebo transakčný), aby sa dali funkcie testovať bez zápisu. */
type Db = Pick<PrismaClient, "agentNote">;

export interface NoteInput {
  agent: "miro" | "nora" | "lab" | "user";
  kind: NoteKind;
  leadId?: string | null;
  title?: string;
  body?: string;
  data?: unknown;
}

export interface NoteRow {
  id: string;
  agent: string;
  kind: string;
  leadId: string | null;
  title: string | null;
  body: string | null;
  data: unknown;
  createdAt: Date;
}

let available: boolean | null = null;

/** Existuje tabuľka agent_notes? (kladný výsledok sa zapamätá) */
export async function notesAvailable(db: Db = prisma): Promise<boolean> {
  if (available === true) return true;
  try {
    await db.agentNote.findFirst({ select: { id: true } });
    available = true;
    return true;
  } catch {
    return false;
  }
}

/** Zapíše poznámku. Vráti false, ak sa nepodarilo (napr. chýba tabuľka). */
export async function writeNote(n: NoteInput, db: Db = prisma): Promise<boolean> {
  try {
    await db.agentNote.create({
      data: {
        agent: n.agent,
        kind: n.kind,
        leadId: n.leadId ?? null,
        title: n.title?.slice(0, 200) ?? null,
        body: n.body?.slice(0, 4000) ?? null,
        data: (n.data ?? undefined) as never,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function listNotes(
  where: { kind?: NoteKind; agent?: string; leadId?: string; leadIds?: string[]; since?: Date },
  take = 50,
  db: Db = prisma,
): Promise<NoteRow[]> {
  try {
    return (await db.agentNote.findMany({
      where: {
        ...(where.kind ? { kind: where.kind } : {}),
        ...(where.agent ? { agent: where.agent } : {}),
        ...(where.leadId ? { leadId: where.leadId } : {}),
        ...(where.leadIds ? { leadId: { in: where.leadIds } } : {}),
        ...(where.since ? { createdAt: { gte: where.since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    })) as NoteRow[];
  } catch {
    return [];
  }
}

/** Odôvodnenie (verdikt) Skauta pre zadané leady; pri viacerých záznamoch platí najnovší. */
export async function latestVerdicts(leadIds: string[], db: Db = prisma): Promise<Map<string, NoteRow>> {
  const out = new Map<string, NoteRow>();
  if (!leadIds.length) return out;
  const rows = await listNotes({ kind: "verdict", leadIds }, Math.max(50, leadIds.length * 2), db);
  for (const r of rows) if (r.leadId && !out.has(r.leadId)) out.set(r.leadId, r);
  return out;
}

/**
 * Lekcie a spätná väzba pre prompt agenta: čo sa agenti naučili a čo človek alebo druhý agent
 * vytkol. Prázdny reťazec, ak nič nie je (prompt sa nezmení).
 */
export async function lessonsBlock(agent: "miro" | "nora", db: Db = prisma): Promise<string> {
  const [lessons, feedback] = await Promise.all([
    listNotes({ kind: "lesson" }, 30, db),
    listNotes({ kind: "feedback" }, 12, db),
  ]);
  // lekcie majú v data.for adresáta ("miro" | "nora" | "all")
  const forWhom = (l: NoteRow) => (l.data as { for?: string } | null)?.for ?? "all";
  const mine = lessons.filter((l) => forWhom(l) === agent || forWhom(l) === "all").slice(0, 8);
  const fb = feedback.slice(0, 8);
  if (!mine.length && !fb.length) return "";
  const lines = [
    ...mine.map((l) => `- Lekcia: ${l.body ?? l.title ?? ""}`.slice(0, 300)),
    ...fb.map((f) => `- Vytknuté (${f.agent === "user" ? "človekom" : "Norou"}): ${f.title ?? ""}${f.body ? `: ${f.body}` : ""}`.slice(0, 300)),
  ];
  return `\n\nNAUČENÉ LEKCIE A SPÄTNÁ VÄZBA (riaď sa nimi, sú z reálnej práce):\n${lines.join("\n")}`;
}
