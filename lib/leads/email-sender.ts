import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

// Outreach is sent from Samuel's own address. Primary path: Gmail / Google
// Workspace SMTP via Nodemailer — it looks like a personal email (no
// List-Unsubscribe header, no "marketing" footprint), so it lands in the inbox.
// Brevo's transactional REST API stays as a fallback if Gmail isn't configured
// or a send fails.
const SENDER = { name: "Samuel Bibeň", email: "biben@sbdesign.sk" };
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
// Absolute base for the open-tracking pixel (must be the deployed app's domain).
const TRACK_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://ads.sbdesign.sk").replace(/\/$/, "");

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Clean the plain-text body before sending: em/en dashes read as "AI-written"
 * and render inconsistently, so use a plain hyphen; also strip any stray bold or
 * italic markdown asterisks.
 */
function sanitizeEmailText(text: string): string {
  return text
    .replace(/—/g, "-") // em dash → hyphen
    .replace(/–/g, "-") // en dash → hyphen
    .replace(/\*\*(.*?)\*\*/g, "$1") // strip bold
    .replace(/\*(.*?)\*/g, "$1") // strip italic
    .trim();
}

// HTML email: the (sanitised, escaped) body, Samuel's signature card, and an
// optional 1x1 open-tracking pixel.
function toHtml(body: string, trackingId?: string): string {
  const safeBody = escapeHtml(sanitizeEmailText(body)).replace(/\n/g, "<br>");
  const pixel = trackingId
    ? `<img src="${TRACK_BASE}/api/track/email-open/${trackingId}" width="1" height="1" style="display:none;visibility:hidden;" alt="">`
    : "";
  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; max-width: 600px;">
  <div style="white-space: pre-wrap; line-height: 1.6;">${safeBody}</div>
  <br><br>
  <table cellpadding="0" cellspacing="0" style="border-left: 3px solid #4A90D9; padding-left: 12px; margin-top: 8px;">
    <tr>
      <td style="padding-right: 14px; vertical-align: top;">
        <img src="https://mtktuwvwgdnyjduhvsko.supabase.co/storage/v1/object/public/assets/Fotka-nova-2.png"
        width="72" height="72"
        style="border-radius: 50%; object-fit: cover; object-position: top;"
        alt="Samuel Bibeň">
      </td>
      <td style="vertical-align: top; font-family: Arial, sans-serif;">
        <div style="font-weight: bold; font-size: 15px;">Bc. Samuel Bibeň</div>
        <div style="color: #666666; font-size: 12px; margin-bottom: 6px;">Digitálny Marketing</div>
        <div style="font-size: 12px; line-height: 1.8; color: #333333;">
          M: +421 911 183 131<br>
          E: <a href="mailto:biben@sbdesign.sk" style="color: #4A90D9; text-decoration: none;">biben@sbdesign.sk</a> |
          <a href="https://www.sbdesign.sk" style="color: #4A90D9; text-decoration: none;">www.sbdesign.sk</a><br>
          Mostná 42 | 949 01 Nitra
        </div>
      </td>
    </tr>
  </table>
  ${pixel}
</div>`;
}

let transporter: nodemailer.Transporter | null = null;
function gmailTransporter(): nodemailer.Transporter | null {
  if (!gmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS on 587
      auth: {
        user: process.env.GMAIL_USER!.trim(),
        pass: process.env.GMAIL_APP_PASSWORD!.trim(),
      },
    });
  }
  return transporter;
}

interface SendArgs {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  emailType: string;
}
type Delivery = { ok: boolean; messageId?: string | null; error?: string };

async function sendViaGmail(a: SendArgs): Promise<Delivery> {
  const t = gmailTransporter();
  if (!t) return { ok: false, error: "gmail_not_configured" };
  try {
    const info = await t.sendMail({
      from: `"${SENDER.name}" <${SENDER.email}>`,
      to: a.to,
      replyTo: SENDER.email,
      subject: a.subject,
      html: a.html,
      text: a.text, // plain-text fallback
    });
    return { ok: true, messageId: info.messageId ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendViaBrevo(a: SendArgs): Promise<Delivery> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY nie je nastavený." };
  // Transactional endpoint — Brevo does NOT add List-Unsubscribe / marketing
  // headers here (that's only for marketing campaigns).
  const payload = {
    sender: SENDER,
    to: [{ email: a.to, name: a.toName }],
    replyTo: SENDER,
    subject: a.subject,
    htmlContent: a.html,
    textContent: a.text,
    tags: ["outreach", a.emailType],
  };
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message || `Brevo HTTP ${res.status}` };
    return { ok: true, messageId: data.messageId ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Send one lead_email. Tries Gmail SMTP first, falls back to Brevo. Persists the
 * message id + sent timestamp, flips the email to "sent" and the lead to
 * "contacted". If the lead has no e-mail, marks the email "failed" and notes it.
 */
export async function sendLeadEmail(leadEmailId: string): Promise<SendResult> {
  const email = await prisma.leadEmail.findUnique({ where: { id: leadEmailId }, include: { lead: true } });
  if (!email) return { success: false, error: "email_not_found" };
  const lead = email.lead;

  if (!lead.companyEmail?.trim()) {
    await prisma.leadEmail.update({ where: { id: leadEmailId }, data: { status: "failed" } });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { notes: `${lead.notes ? lead.notes + "\n" : ""}Chýba email — nedá sa odoslať outreach.` },
    });
    return { success: false, error: "missing_email" };
  }

  const args: SendArgs = {
    to: lead.companyEmail.trim(),
    toName: lead.companyName,
    subject: sanitizeEmailText(email.subject),
    html: toHtml(email.body, leadEmailId),
    text: sanitizeEmailText(email.body),
    emailType: email.emailType,
  };

  // Gmail first (personal-looking, no unsubscribe); Brevo as fallback.
  let delivery = await sendViaGmail(args);
  if (!delivery.ok && brevoConfigured()) {
    delivery = await sendViaBrevo(args);
  }

  if (!delivery.ok) {
    await prisma.leadEmail.update({ where: { id: leadEmailId }, data: { status: "failed" } }).catch(() => {});
    return { success: false, error: delivery.error };
  }

  const now = new Date();
  await prisma.leadEmail.update({
    where: { id: leadEmailId },
    // brevoMessageId keeps the provider message id (Gmail or Brevo).
    data: { status: "sent", sentAt: now, brevoMessageId: delivery.messageId ?? null },
  });
  // Advance the lead unless it already replied/converted.
  if (["new", "contacted"].includes(lead.status)) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
  }
  return { success: true };
}

/**
 * Queue two follow-ups after an initial e-mail. Bodies are left empty — they get
 * generated when they fall due (so they reflect the latest thread), then surface
 * in the campaign queue for approval.
 */
export async function scheduleFollowUps(leadId: string, initialEmailId: string): Promise<void> {
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
