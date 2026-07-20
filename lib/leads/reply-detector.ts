import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/prisma";

/**
 * Rozpoznanie odpovedí. Outreach maily majú Reply-To na biben@sbdesign.sk, takže
 * odpoveď leadu príde do INBOXu tej istej schránky (Websupport), z ktorej sa
 * posiela. Tento detektor prejde INBOX, spáruje odosielateľa doručených správ
 * s e-mailom leadu a označí, že lead odpovedal.
 *
 * Je idempotentný: `repliedAt` na maile nastaví len raz (keď je prázdny), takže
 * ho možno púšťať opakovane (cron) bez dvojitého počítania.
 */

const IMAP_HOST = process.env.IMAP_HOST?.trim() || "imap.m1.websupport.sk";
const IMAP_PORT = Number(process.env.IMAP_PORT ?? 993);

export function replyDetectionConfigured(): boolean {
  return Boolean(
    process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim(),
  );
}

/** Vlastná adresa — správu od seba samého nikdy nepočítame ako odpoveď leadu. */
function ownAddresses(): Set<string> {
  const set = new Set<string>();
  for (const v of [process.env.SMTP_USER, "biben@sbdesign.sk"]) {
    if (v?.includes("@")) set.add(v.trim().toLowerCase());
  }
  return set;
}

interface Envelope {
  from?: { address?: string }[];
  date?: Date;
}

export interface ReplyScanResult {
  scanned: number; // koľko doručených správ sme prezreli
  matched: number; // koľko z nich sadlo na kontaktovaný lead
  newReplies: number; // koľko nových odpovedí sme práve zaznamenali
  configured: boolean;
}

/**
 * @param sinceDays dokedy do minulosti čítať INBOX (predvolene 45 dní).
 */
export async function detectReplies(sinceDays = 45): Promise<ReplyScanResult> {
  if (!replyDetectionConfigured()) {
    return { scanned: 0, matched: 0, newReplies: 0, configured: false };
  }

  // Mapa e-mail → najnovší odoslaný outreach naň. Odpoveď párujeme presne podľa
  // adresy odosielateľa; párovanie podľa domény robíme len ak je pre danú doménu
  // jediný kontaktovaný lead (inak by dve firmy z jednej domény boli nejasné).
  const sent = await prisma.leadEmail.findMany({
    where: {
      status: "sent",
      sentAt: { not: null },
      lead: { companyEmail: { not: null } },
    },
    select: {
      id: true,
      leadId: true,
      sentAt: true,
      repliedAt: true,
      lead: { select: { companyEmail: true, status: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  const byEmail = new Map<string, (typeof sent)[number]>();
  const domainCount = new Map<string, number>();
  const byDomain = new Map<string, (typeof sent)[number]>();
  for (const e of sent) {
    const email = e.lead.companyEmail!.trim().toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, e); // najnovší (zoradené desc)
    const domain = email.split("@")[1];
    if (domain) {
      domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
      if (!byDomain.has(domain)) byDomain.set(domain, e);
    }
  }
  if (!byEmail.size)
    return { scanned: 0, matched: 0, newReplies: 0, configured: true };

  const own = ownAddresses();
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
    logger: false,
  });

  let scanned = 0;
  let matched = 0;
  let newReplies = 0;

  await client.connect();
  const lock = await client.getMailboxLock("INBOX").catch(() => null);
  if (!lock) {
    await client.logout().catch(() => {});
    return { scanned: 0, matched: 0, newReplies: 0, configured: true };
  }

  try {
    // Najprv IMAP SEARCH (fetch nevie prijať vyhľadávací objekt priamo), potom
    // stiahneme len obálky nájdených UID — žiadne telá (rýchle, šetrné).
    const uids = await client.search({ since }, { uid: true });
    if (!uids || !uids.length) {
      return { scanned: 0, matched: 0, newReplies: 0, configured: true };
    }
    for await (const msg of client.fetch(
      uids,
      { envelope: true },
      { uid: true },
    )) {
      const env = msg.envelope as Envelope | undefined;
      const from = env?.from?.[0]?.address?.trim().toLowerCase();
      if (!from || own.has(from)) continue;
      scanned++;

      let hit = byEmail.get(from);
      if (!hit) {
        const domain = from.split("@")[1];
        if (domain && domainCount.get(domain) === 1) hit = byDomain.get(domain);
      }
      if (!hit) continue;
      matched++;

      const msgDate = env?.date ?? new Date();
      // Odpoveď musí prísť PO odoslaní a len raz ju zaznamenáme.
      if (hit.repliedAt || (hit.sentAt && msgDate < hit.sentAt)) continue;

      await prisma.leadEmail.update({
        where: { id: hit.id },
        data: { repliedAt: msgDate },
      });
      if (hit.lead.status !== "converted") {
        await prisma.lead.update({
          where: { id: hit.leadId },
          data: { status: "responded" },
        });
      }
      hit.repliedAt = msgDate; // aby sa v tomto behu nezapočítalo dvakrát
      newReplies++;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  return { scanned, matched, newReplies, configured: true };
}
