import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

// Diagnostic-only: verifies whether Gmail SMTP accepts GMAIL_USER/GMAIL_APP_PASSWORD
// on the *deployed* environment (Vercel env vars can differ from .env.local).
// nodemailer needs the Node runtime; force-dynamic so env is read per request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();

  const diag = {
    user: user ?? null,
    passExists: !!pass,
    passLength: pass?.length ?? 0,
    brevoConfigured: !!process.env.BREVO_API_KEY?.trim(),
  };

  if (!user || !pass) {
    return NextResponse.json({ ok: false, error: "GMAIL_USER / GMAIL_APP_PASSWORD not set", ...diag }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on 587
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    return NextResponse.json({ ok: true, ...diag });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), ...diag }, { status: 500 });
  }
}
