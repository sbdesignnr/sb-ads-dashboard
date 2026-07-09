import nodemailer from "nodemailer";
import type { Booking } from "@prisma/client";

const SENDER = { name: "Samuel Bibeň", email: "biben@sbdesign.sk" };
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}
function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

// True if *any* delivery path is available (Gmail SMTP or Brevo REST).
export function bookingEmailConfigured(): boolean {
  return gmailConfigured() || brevoConfigured();
}

// Gmail SMTP — personal-looking (no marketing headers). A fresh transporter per
// send reads GMAIL_* from process.env at call time (no build-time / cross-invocation cache).
async function sendViaGmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!gmailConfigured()) return false;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on 587
    auth: { user: process.env.GMAIL_USER!.trim(), pass: process.env.GMAIL_APP_PASSWORD!.trim() },
  });
  try {
    const info = await transporter.sendMail({
      from: `"${SENDER.name}" <${SENDER.email}>`,
      to,
      replyTo: SENDER.email,
      subject,
      html,
      text,
    });
    console.log("[booking/email] Gmail sent OK:", subject, "→", to, info.messageId);
    return true;
  } catch (e) {
    console.error("[booking/email] Gmail send error:", subject, "→", (e as Error).message);
    return false;
  }
}

// Brevo transactional REST — fallback when Gmail isn't configured or fails.
async function sendViaBrevo(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return false;
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: to }],
        replyTo: SENDER,
        subject,
        htmlContent: html,
        textContent: text,
        tags: ["booking"],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok) {
      console.error("[booking/email] Brevo send error:", subject, `HTTP ${res.status}`, data.message ?? "");
      return false;
    }
    console.log("[booking/email] Brevo sent OK:", subject, "→", to, data.messageId);
    return true;
  } catch (e) {
    console.error("[booking/email] Brevo send error:", subject, "→", (e as Error).message);
    return false;
  }
}

function fmtDate(d: Date): string {
  // e.g. "pondelok, 15. júla 2026" — booking dates are UTC midnight.
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Samuel's signature card — identical to the lead outreach emails (lib/leads/email-sender.ts).
function signatureCard(): string {
  return `<table cellpadding="0" cellspacing="0" style="border-left: 3px solid #4A90D9; padding-left: 12px; margin-top: 8px;">
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
</table>`;
}

// Plain-text version of the signature (for the text/plain fallback part).
const SIGNATURE_TEXT = `Bc. Samuel Bibeň
Digitálny Marketing
M: +421 911 183 131
E: biben@sbdesign.sk | www.sbdesign.sk
Mostná 42 | 949 01 Nitra`;

function wrap(inner: string, withCard = false): string {
  const card = withCard ? `<br>${signatureCard()}` : "";
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; max-width: 600px; line-height: 1.6;">${inner}${card}</div>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  console.log("[booking/email] Sending to:", to, "| subject:", subject);
  console.log(
    "[booking/email] Gmail user:",
    process.env.GMAIL_USER ?? "(unset)",
    "| Gmail pass exists:",
    !!process.env.GMAIL_APP_PASSWORD,
    "| Brevo key exists:",
    !!process.env.BREVO_API_KEY,
  );
  if (!bookingEmailConfigured()) {
    console.log("[booking/email] skipped — no delivery path configured (Gmail nor Brevo):", subject);
    return false;
  }
  // Gmail first (personal-looking); Brevo as fallback if Gmail fails or isn't configured.
  if (await sendViaGmail(to, subject, html, text)) return true;
  console.log("[booking/email] Gmail path unavailable/failed → trying Brevo fallback:", subject);
  return sendViaBrevo(to, subject, html, text);
}

export async function sendBookingConfirmation(b: Booking): Promise<boolean> {
  const day = fmtDate(b.date);
  const meet = b.googleMeetLink ? `Link na hovor: ${b.googleMeetLink}` : "Detail hovoru Vám pošleme deň pred termínom.";
  const text = `Dobrý deň, ${b.clientName},

Váš termín bol úspešne rezervovaný.

Dátum: ${day}
Čas: ${b.startTime} - ${b.endTime}
Forma: Online hovor

${meet}

Ak potrebujete termín zmeniť alebo zrušiť, odpovedzte na tento email.

${SIGNATURE_TEXT}`;
  const html = wrap(
    `<p>Dobrý deň, ${esc(b.clientName)},</p>
<p>Váš termín bol úspešne rezervovaný.</p>
<p>
  <strong>Dátum:</strong> ${esc(day)}<br>
  <strong>Čas:</strong> ${b.startTime} - ${b.endTime}<br>
  <strong>Forma:</strong> Online hovor
</p>
<p>${
      b.googleMeetLink
        ? `Link na hovor: <a href="${esc(b.googleMeetLink)}">${esc(b.googleMeetLink)}</a>`
        : "Detail hovoru Vám pošleme deň pred termínom."
    }</p>
<p>Ak potrebujete termín zmeniť alebo zrušiť, odpovedzte na tento email.</p>`,
    true,
  );
  return send(b.clientEmail, "Potvrdenie termínu - SB Design", html, text);
}

export async function sendBookingNotification(b: Booking, ownerEmail: string): Promise<boolean> {
  const day = fmtDate(b.date);
  const text = `Nová rezervácia:

Klient: ${b.clientName}
Email: ${b.clientEmail}
Telefón: ${b.clientPhone ?? "-"}
Firma: ${b.clientCompany ?? "-"}
Dátum: ${day} o ${b.startTime}
Správa: ${b.message ?? "-"}`;
  const html = wrap(`<p><strong>Nová rezervácia:</strong></p>
<p>Klient: ${esc(b.clientName)}<br>
Email: <a href="mailto:${esc(b.clientEmail)}">${esc(b.clientEmail)}</a><br>
Telefón: ${esc(b.clientPhone ?? "-")}<br>
Firma: ${esc(b.clientCompany ?? "-")}<br>
Dátum: ${esc(day)} o ${b.startTime}<br>
Správa: ${esc(b.message ?? "-")}</p>`);
  const who = `${b.clientName}${b.clientCompany ? ` ${b.clientCompany}` : ""}`;
  return send(ownerEmail, `Nová rezervácia - ${who}`, html, text);
}

export async function sendBookingReminder(b: Booking): Promise<boolean> {
  const day = fmtDate(b.date);
  const text = `Dobrý deň, ${b.clientName},

pripomíname Vám zajtrajší hovor:

Dátum: ${day} o ${b.startTime}${b.googleMeetLink ? `\nLink na hovor: ${b.googleMeetLink}` : ""}

Tešíme sa na Vás!

${SIGNATURE_TEXT}`;
  const html = wrap(
    `<p>Dobrý deň, ${esc(b.clientName)},</p>
<p>pripomíname Vám zajtrajší hovor:</p>
<p>Dátum: ${esc(day)} o ${b.startTime}${
      b.googleMeetLink ? `<br>Link na hovor: <a href="${esc(b.googleMeetLink)}">${esc(b.googleMeetLink)}</a>` : ""
    }</p>
<p>Tešíme sa na Vás!</p>`,
    true,
  );
  return send(b.clientEmail, `Pripomienka: zajtra o ${b.startTime} - SB Design`, html, text);
}
