import { ImapFlow } from "imapflow";

/**
 * Save a copy of an outgoing message to the mailbox's "Sent" folder.
 *
 * SMTP only *delivers* — it never files a copy in Sent (that's an IMAP folder).
 * Gmail's SMTP did this implicitly, which is why sent outreach used to show up
 * there; Websupport SMTP does not. So after each send we APPEND the exact same
 * raw message over IMAP, and the e-mail shows up in Sent (webmail, Gmail-over-
 * IMAP, phone — wherever the mailbox is read).
 *
 * Strictly best-effort: a failure here must never fail an e-mail that was already
 * delivered to the recipient.
 */

const IMAP_HOST = process.env.IMAP_HOST?.trim() || "imap.m1.websupport.sk";
const IMAP_PORT = Number(process.env.IMAP_PORT ?? 993);

export function sentFolderConfigured(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim());
}

/** Resolve the Sent folder: prefer the \Sent special-use flag, else match by name. */
async function findSentPath(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const bySpecialUse = boxes.find((b) => (b as { specialUse?: string }).specialUse === "\\Sent");
  if (bySpecialUse) return bySpecialUse.path;
  const byName = boxes.find((b) => /^(sent|odoslan|sent items|sent mail)/i.test(b.path));
  return byName?.path ?? null;
}

export async function saveToSent(raw: Buffer): Promise<boolean> {
  if (!sentFolderConfigured()) return false;

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD!.trim() },
    logger: false,
  });

  try {
    await client.connect();
    const path = await findSentPath(client);
    if (!path) {
      console.warn("[sent-folder] Priečinok Sent sa nenašiel — kópia neuložená.");
      return false;
    }
    // \Seen so the copy doesn't show up as an unread e-mail.
    await client.append(path, raw, ["\\Seen"]);
    console.log("[sent-folder] Kópia uložená do:", path);
    return true;
  } catch (e) {
    console.warn("[sent-folder] Uloženie kópie zlyhalo:", (e as Error).message);
    return false;
  } finally {
    await client.logout().catch(() => {});
  }
}
