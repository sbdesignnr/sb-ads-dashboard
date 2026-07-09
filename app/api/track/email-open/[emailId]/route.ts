import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICRAEAOw==", "base64");
const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  "Content-Length": String(PIXEL.length),
};

// Skip obvious bots / link scanners / chat-app link previews / email-security
// gateways so their prefetch doesn't count as a real human open.
// NOTE: we deliberately do NOT filter GoogleImageProxy — Gmail loads the pixel
// through it when the recipient actually opens the email, so filtering it would
// drop opens for most recipients.
const BOT_RE =
  /bot|crawler|spider|preview|curl|wget|slack|whatsapp|telegram|facebookexternalhit|twitterbot|linkedinbot|discord|python-requests|proofpoint|barracuda|mimecast/i;

interface OpenEntry {
  ts: string;
  ip: string;
  ua: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  console.log("PIXEL HIT:", emailId, new Date().toISOString());
  const ua = request.headers.get("user-agent") ?? "unknown";
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Record the open. We await the DB write (serverless would otherwise drop an
  // un-awaited promise after the response), but it's a tiny write so the pixel
  // still returns in a few ms. Tracking errors never fail the pixel.
  if (BOT_RE.test(ua)) {
    console.log("Pixel: bot/scanner skipped for", emailId);
  } else {
    try {
      const row = await prisma.leadEmail.findUnique({
        where: { id: emailId },
        select: { openedAt: true, openCount: true, openLog: true },
      });
      if (!row) {
        console.log("Pixel: no leadEmail found for", emailId);
      } else {
        console.log("Current openCount before update:", row.openCount, "for", emailId);
        const log = (Array.isArray(row.openLog) ? row.openLog : []) as unknown as OpenEntry[];
        const now = new Date();
        log.push({ ts: now.toISOString(), ip, ua: ua.slice(0, 300) });
        await prisma.leadEmail.update({
          where: { id: emailId },
          data: {
            openCount: { increment: 1 },
            lastOpenedAt: now,
            ...(row.openedAt ? {} : { openedAt: now }), // set first-open only once
            openLog: log.slice(-20) as unknown as Prisma.InputJsonValue, // keep last 20
          },
        });
      }
    } catch (e) {
      console.error("Pixel tracking error for", emailId, e); // never break the pixel
    }
  }

  return new NextResponse(new Uint8Array(PIXEL), { status: 200, headers: PIXEL_HEADERS });
}
