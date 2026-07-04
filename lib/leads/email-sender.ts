import { prisma } from "@/lib/prisma";

// All outreach is sent from Samuel's address via Brevo's transactional REST API.
// (The @getbrevo/brevo v6 SDK dropped the classic TransactionalEmailsApi, so we
// call the stable REST endpoint directly — no SDK/version coupling.)
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "Samuel Bibeň", email: "biben@sbdesign.sk" };

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Em/en dashes read as "AI-written" and render inconsistently — use a plain hyphen.
function normalizeDashes(s: string): string {
  return s.replace(/[—–]/g, "-");
}

// HTML email: the body followed by Samuel's signature card. Body is escaped and
// its line breaks converted to <br>.
function toHtml(body: string): string {
  const safeBody = escapeHtml(normalizeDashes(body)).replace(/\n/g, "<br>");
  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; max-width: 600px;">
  <div style="white-space: pre-wrap;">${safeBody}</div>
  <br><br>
  <table cellpadding="0" cellspacing="0" style="border-left: 3px solid #4A90D9; padding-left: 12px; margin-top: 8px;">
    <tr>
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
</div>`;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Send one lead_email via Brevo. Persists the Brevo message id + sent timestamp,
 * flips the email to "sent" and the lead to "contacted". If the lead has no
 * e-mail, marks the email "failed" and notes it on the lead.
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

  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { success: false, error: "BREVO_API_KEY nie je nastavený." };

  const payload = {
    sender: SENDER,
    to: [{ email: lead.companyEmail.trim(), name: lead.companyName }],
    replyTo: SENDER,
    subject: normalizeDashes(email.subject),
    htmlContent: toHtml(email.body),
    textContent: normalizeDashes(email.body),
    tags: ["lead-outreach", email.emailType],
  };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok) {
      await prisma.leadEmail.update({ where: { id: leadEmailId }, data: { status: "failed" } });
      return { success: false, error: data.message || `Brevo HTTP ${res.status}` };
    }
    const now = new Date();
    await prisma.leadEmail.update({
      where: { id: leadEmailId },
      data: { status: "sent", sentAt: now, brevoMessageId: data.messageId ?? null },
    });
    // Advance the lead unless it already replied/converted.
    if (["new", "contacted"].includes(lead.status)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });
    }
    return { success: true };
  } catch (e) {
    await prisma.leadEmail.update({ where: { id: leadEmailId }, data: { status: "failed" } }).catch(() => {});
    return { success: false, error: (e as Error).message };
  }
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
