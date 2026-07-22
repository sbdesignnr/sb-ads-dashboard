import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { saveToSent } from "@/lib/email/sent-folder";
import { prisma } from "@/lib/prisma";

// Outreach is sent from Samuel's own address. Primary path: Websupport SMTP via
// Nodemailer — it looks like a personal email (no List-Unsubscribe header, no
// "marketing" footprint), so it lands in the inbox. Brevo's transactional REST
// API stays as a fallback if SMTP isn't configured or a send fails.
const SENDER = { name: "Samuel Bibeň", email: "biben@sbdesign.sk" };
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
// Absolute base for the open-tracking pixel (must be the deployed app's domain).
const TRACK_BASE = (
  process.env.NEXT_PUBLIC_APP_URL || "https://ads.sbdesign.sk"
).replace(/\/$/, "");

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim(),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Em/en dashes read as "AI-written" and render inconsistently — use a hyphen. */
function normalizeDashes(text: string): string {
  return text.replace(/—/g, "-").replace(/–/g, "-").trim();
}

/**
 * The body supports a tiny Markdown subset the user types in the editor:
 *   **tučné**, *šikmé*, [text](https://odkaz)
 * `markdownToPlain` flattens it for the text/plain part; `markdownToHtml` renders
 * it. HTML is escaped BEFORE this runs, so a link's text/URL can't inject markup —
 * and only http(s) URLs are matched, which rules out `javascript:` hrefs.
 */
// Boundaries matter: without them a stray asterisk (e.g. "5*3 a text *") would
// italicise half the e-mail. Emphasis must hug its text — no space just inside the
// markers — and italic must not open right after a word character.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD_RE = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g;
const ITALIC_RE = /(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g;

function markdownToPlain(text: string): string {
  return text
    .replace(LINK_RE, "$1 ($2)")
    .replace(BOLD_RE, "$1")
    .replace(ITALIC_RE, "$1$2");
}

function markdownToHtml(escaped: string): string {
  return escaped
    .replace(
      LINK_RE,
      '<a href="$2" style="color:#4A90D9;text-decoration:underline;">$1</a>',
    )
    .replace(BOLD_RE, "<strong>$1</strong>")
    .replace(ITALIC_RE, "$1<em>$2</em>");
}

/** Subject + plain-text body: no dashes, no markup. */
function sanitizeEmailText(text: string): string {
  return markdownToPlain(normalizeDashes(text));
}

/** Render the small Markdown subset of a stored body to safe HTML. */
function bodyToHtml(body: string): string {
  return markdownToHtml(escapeHtml(normalizeDashes(body))).replace(
    /\n/g,
    "<br>",
  );
}

// HTML email: the (sanitised, escaped) body, Samuel's signature card, an optional
// quoted previous message (for follow-up "replies"), and an optional tracking pixel.
function toHtml(
  body: string,
  trackingId?: string,
  quotedHtml?: string,
): string {
  // Escape first (no HTML injection), THEN render the Markdown subset.
  const safeBody = markdownToHtml(escapeHtml(normalizeDashes(body))).replace(
    /\n/g,
    "<br>",
  );
  // NOTE: do NOT use display:none/visibility:hidden — Gmail/Outlook skip loading
  // hidden images, which breaks open tracking. opacity:0.01 keeps it imperceptible
  // but still "visible" enough that clients load it.
  let pixel = "";
  if (trackingId) {
    const trackingUrl = `${TRACK_BASE}/api/track/email-open/${trackingId}`;
    console.log(
      "[email-sender] Tracking pixel URL:",
      trackingUrl,
      "| NEXT_PUBLIC_APP_URL:",
      process.env.NEXT_PUBLIC_APP_URL ??
        "(unset → fallback https://ads.sbdesign.sk)",
    );
    pixel = `<img src="${trackingUrl}" width="1" height="1" alt="" style="position:absolute;opacity:0.01;">`;
  }
  // The signature web link routes through the click tracker. Gmail caches the
  // open pixel after one load (so opens count once), but a click is a second,
  // independent engagement signal.
  const webHref = trackingId
    ? `${TRACK_BASE}/api/track/click/${trackingId}?url=${encodeURIComponent("https://www.sbdesign.sk")}`
    : "https://www.sbdesign.sk";
  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; max-width: 600px;">
  <div style="white-space: pre-wrap; line-height: 1.6;">${safeBody}</div>
  <br><br>
  <table cellpadding="0" cellspacing="0" style="border-left: 3px solid #4A90D9; padding-left: 12px; margin-top: 8px;">
    <tr>
      <td style="padding-right: 14px; vertical-align: top;">
        <img src="https://mtktuwvwgdnyjduhvsko.supabase.co/storage/v1/object/public/assets/Fotka-nova-2.png"
        width="90" height="90"
        style="border-radius: 50%; object-fit: cover; object-position: top;"
        alt="Samuel Bibeň">
      </td>
      <td style="vertical-align: top; font-family: Arial, sans-serif;">
        <div style="font-weight: bold; font-size: 15px;">Bc. Samuel Bibeň</div>
        <div style="color: #666666; font-size: 12px; margin-bottom: 6px;">Digitálny Marketing</div>
        <div style="font-size: 12px; line-height: 1.8; color: #333333;">
          M: +421 911 183 131<br>
          E: <a href="mailto:biben@sbdesign.sk" style="color: #4A90D9; text-decoration: none;">biben@sbdesign.sk</a> |
          <a href="${webHref}" style="color: #4A90D9; text-decoration: none;">www.sbdesign.sk</a><br>
          Mostná 42 | 949 01 Nitra
        </div>
      </td>
    </tr>
  </table>
  ${quotedHtml ?? ""}
  ${pixel}
</div>`;
}

// ── Vláknenie follow-upov (odpoveď na predošlý mail) ──────────────────────────
// Follow-up sa posiela ako ODPOVEĎ na predošlý mail v konverzácii: nastaví
// In-Reply-To/References (aby Gmail spojil vlákno) a pod text pridá citáciu
// predošlej správy. followup1 odpovedá na initial, followup2 na followup1.

interface ThreadContext {
  inReplyTo: string;
  references: string[];
  subject: string; // "Re: <pôvodný predmet>"
  quotedHtml: string;
  quotedText: string;
}

/** Odstráni prípadné vedúce „Re:" (aj viacnásobné). */
function stripRe(s: string): string {
  return s.replace(/^\s*(re\s*:\s*)+/i, "").trim();
}

function buildQuote(prev: {
  subject: string;
  body: string;
  sentAt: Date | null;
  createdAt: Date;
}): {
  quotedHtml: string;
  quotedText: string;
} {
  const when = prev.sentAt ?? prev.createdAt;
  const date = new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  }).format(when);
  const header = `Dňa ${date} Bc. Samuel Bibeň <${SENDER.email}> napísal:`;

  const quotedHtml = `
  <div style="margin-top:16px;">
    <div style="color:#555555; font-size:13px; font-family: Arial, sans-serif;">${escapeHtml(header)}</div>
    <blockquote style="margin:6px 0 0; padding-left:12px; border-left:2px solid #cccccc; color:#555555; font-family: Arial, sans-serif; font-size:13px; line-height:1.6;">
      ${bodyToHtml(prev.body)}
    </blockquote>
  </div>`;

  const quotedText =
    `\n\n${header}\n` +
    sanitizeEmailText(prev.body)
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");

  return { quotedHtml, quotedText };
}

/**
 * Zostaví vláknenie pre follow-up. Vráti null pri initiali alebo keď sa predošlý
 * odoslaný mail (s Message-ID) nenájde — vtedy sa pošle ako samostatný mail.
 */
export async function buildThreadContext(email: {
  leadId: string;
  emailType: string;
  subject: string;
}): Promise<ThreadContext | null> {
  if (email.emailType !== "followup1" && email.emailType !== "followup2")
    return null;

  const sent = { leadId: email.leadId, status: "sent" as const };
  const initial = await prisma.leadEmail.findFirst({
    where: { ...sent, emailType: "initial" },
    orderBy: { sentAt: "asc" },
  });
  const followup1 =
    email.emailType === "followup2"
      ? await prisma.leadEmail.findFirst({
          where: { ...sent, emailType: "followup1" },
          orderBy: { sentAt: "asc" },
        })
      : null;

  // Na koho odpovedáme: followup1 → initial, followup2 → followup1 (inak initial).
  const parent =
    email.emailType === "followup2" ? (followup1 ?? initial) : initial;
  if (!parent?.brevoMessageId) return null; // predošlý mail nemá uložené Message-ID

  const references: string[] = [];
  if (initial?.brevoMessageId) references.push(initial.brevoMessageId);
  if (
    followup1?.brevoMessageId &&
    !references.includes(followup1.brevoMessageId)
  ) {
    references.push(followup1.brevoMessageId);
  }
  if (!references.includes(parent.brevoMessageId))
    references.push(parent.brevoMessageId);

  const baseSubject = stripRe(
    initial?.subject || parent.subject || email.subject,
  );
  const { quotedHtml, quotedText } = buildQuote(parent);

  return {
    inReplyTo: parent.brevoMessageId,
    references,
    subject: `Re: ${sanitizeEmailText(baseSubject)}`,
    quotedHtml,
    quotedText,
  };
}

function smtpTransporter(): nodemailer.Transporter | null {
  if (!smtpConfigured()) return null;
  // Fresh transporter per send — reads SMTP_* from process.env at call time.
  return nodemailer.createTransport({
    host: "smtp.m1.websupport.sk",
    port: 465,
    secure: true, // SSL/TLS
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
  });
}

interface SendArgs {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  emailType: string;
  /** Message-ID, ktorý sami vygenerujeme a uložíme — aby naň vedel odpovedať ďalší follow-up. */
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}
type Delivery = { ok: boolean; messageId?: string | null; error?: string };

async function sendViaSmtp(a: SendArgs): Promise<Delivery> {
  const t = smtpTransporter();
  if (!t) return { ok: false, error: "smtp_not_configured" };
  try {
    // Compose the MIME ONCE, then send that exact message and file that exact copy
    // in Sent — so what the client received and what you see in Sent are identical.
    const raw = await new MailComposer({
      from: `"${SENDER.name}" <${SENDER.email}>`,
      to: a.to,
      replyTo: SENDER.email,
      subject: a.subject,
      html: a.html,
      text: a.text, // plain-text fallback
      messageId: a.messageId,
      ...(a.inReplyTo ? { inReplyTo: a.inReplyTo } : {}),
      ...(a.references?.length ? { references: a.references } : {}),
    })
      .compile()
      .build();

    await t.sendMail({ envelope: { from: SENDER.email, to: a.to }, raw });

    // Best-effort — the e-mail is already delivered; a failed copy must not fail it.
    await saveToSent(raw).catch(() => false);

    // Vraciame NÁŠ Message-ID (je v odoslanej správe) — naň sa naviaže ďalší follow-up.
    return { ok: true, messageId: a.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendViaBrevo(a: SendArgs): Promise<Delivery> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY nie je nastavený." };
  // Transactional endpoint — Brevo does NOT add List-Unsubscribe / marketing
  // headers here (that's only for marketing campaigns).
  // Vláknenie cez vlastné hlavičky (Brevo ich prepošle). Message-Id nastavíme tiež,
  // aby naň vedel odpovedať ďalší follow-up.
  const headers: Record<string, string> = { "Message-Id": a.messageId };
  if (a.inReplyTo) headers["In-Reply-To"] = a.inReplyTo;
  if (a.references?.length) headers["References"] = a.references.join(" ");

  const payload = {
    sender: SENDER,
    to: [{ email: a.to, name: a.toName }],
    replyTo: SENDER,
    subject: a.subject,
    htmlContent: a.html,
    textContent: a.text,
    headers,
    tags: ["outreach", a.emailType],
  };
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
    };
    if (!res.ok)
      return { ok: false, error: data.message || `Brevo HTTP ${res.status}` };
    // Uložíme NÁŠ Message-ID (nastavené cez hlavičku) kvôli konzistentnému vláknu.
    return { ok: true, messageId: a.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Send one lead_email. Tries Websupport SMTP first, falls back to Brevo. Persists the
 * message id + sent timestamp, flips the email to "sent" and the lead to
 * "contacted". If the lead has no e-mail, marks the email "failed" and notes it.
 */
export async function sendLeadEmail(leadEmailId: string): Promise<SendResult> {
  const email = await prisma.leadEmail.findUnique({
    where: { id: leadEmailId },
    include: { lead: true },
  });
  if (!email) return { success: false, error: "email_not_found" };
  const lead = email.lead;

  if (!lead.companyEmail?.trim()) {
    await prisma.leadEmail.update({
      where: { id: leadEmailId },
      data: { status: "failed" },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        notes: `${lead.notes ? lead.notes + "\n" : ""}Chýba email — nedá sa odoslať outreach.`,
      },
    });
    return { success: false, error: "missing_email" };
  }

  // Follow-up sa pošle ako odpoveď na predošlý mail (vlákno + citácia).
  const thread = await buildThreadContext(email).catch(() => null);
  const messageId = `<${randomUUID()}@sbdesign.sk>`;

  const args: SendArgs = {
    to: lead.companyEmail.trim(),
    toName: lead.companyName,
    subject: thread ? thread.subject : sanitizeEmailText(email.subject),
    html: toHtml(email.body, leadEmailId, thread?.quotedHtml),
    text: sanitizeEmailText(email.body) + (thread?.quotedText ?? ""),
    emailType: email.emailType,
    messageId,
    inReplyTo: thread?.inReplyTo,
    references: thread?.references,
  };

  // SMTP first (personal-looking, no unsubscribe); Brevo as fallback.
  let delivery = await sendViaSmtp(args);
  if (!delivery.ok && brevoConfigured()) {
    delivery = await sendViaBrevo(args);
  }

  if (!delivery.ok) {
    await prisma.leadEmail
      .update({ where: { id: leadEmailId }, data: { status: "failed" } })
      .catch(() => {});
    return { success: false, error: delivery.error };
  }

  const now = new Date();
  await prisma.leadEmail.update({
    where: { id: leadEmailId },
    // brevoMessageId keeps OUR Message-ID — the next follow-up threads onto it.
    data: {
      status: "sent",
      sentAt: now,
      brevoMessageId: delivery.messageId ?? messageId,
    },
  });
  // Advance the lead unless it already replied/converted.
  if (["new", "contacted"].includes(lead.status)) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "contacted" },
    });
  }
  return { success: true };
}

/**
 * Queue two follow-ups after an initial e-mail. Bodies are left empty — they get
 * generated when they fall due (so they reflect the latest thread), then surface
 * in the campaign queue for approval.
 */
export async function scheduleFollowUps(
  leadId: string,
  initialEmailId: string,
): Promise<void> {
  const now = Date.now();
  const day = 86_400_000;
  const existing = await prisma.leadEmail.findMany({
    where: { leadId, emailType: { in: ["followup1", "followup2"] } },
    select: { emailType: true },
  });
  const have = new Set(existing.map((e) => e.emailType));
  const rows: { emailType: string; days: number }[] = [
    { emailType: "followup1", days: 3 },
    { emailType: "followup2", days: 7 },
  ].filter((r) => !have.has(r.emailType));
  if (!rows.length) return;
  void initialEmailId; // reserved for future threading; follow-ups regenerate from the lead
  await prisma.leadEmail.createMany({
    data: rows.map((r) => ({
      leadId,
      subject: "",
      body: "",
      emailType: r.emailType,
      status: "draft",
      scheduledAt: new Date(now + r.days * day),
    })),
  });
}
