import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

// Diagnostic-only: verifies whether Websupport SMTP accepts SMTP_USER/SMTP_PASSWORD
// on the *deployed* environment (Vercel env vars can differ from .env.local).
// nodemailer needs the Node runtime; force-dynamic so env is read per request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();

  const diag = {
    host: "smtp.m1.websupport.sk",
    user: user ?? null,
    passExists: !!pass,
    passLength: pass?.length ?? 0,
    brevoConfigured: !!process.env.BREVO_API_KEY?.trim(),
  };

  if (!user || !pass) {
    return NextResponse.json({ ok: false, error: "SMTP_USER / SMTP_PASSWORD not set", ...diag }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.m1.websupport.sk",
    port: 465,
    secure: true, // SSL/TLS
    auth: { user, pass },
  });

  try {
    await transporter.verify();
    return NextResponse.json({ ok: true, ...diag });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), ...diag }, { status: 500 });
  }
}
