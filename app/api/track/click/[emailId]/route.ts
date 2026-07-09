import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_URL = "https://www.sbdesign.sk";

// Only ever redirect to sbdesign.sk (+ subdomains) — never an open redirector
// (otherwise the link could be abused to bounce victims to a phishing site).
function safeUrl(raw: string | null): string {
  if (!raw) return DEFAULT_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_URL;
    const host = u.hostname.toLowerCase();
    if (host === "sbdesign.sk" || host.endsWith(".sbdesign.sk")) return u.toString();
    return DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

// Same bot filter as the open pixel: don't count scanner/preview prefetches.
const BOT_RE =
  /bot|crawler|spider|preview|curl|wget|slack|whatsapp|telegram|facebookexternalhit|twitterbot|linkedinbot|discord|python-requests|proofpoint|barracuda|mimecast/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  const target = safeUrl(request.nextUrl.searchParams.get("url"));
  const ua = request.headers.get("user-agent") ?? "unknown";
  console.log("CLICK HIT:", emailId, "→", target, new Date().toISOString());

  if (BOT_RE.test(ua)) {
    console.log("Click: bot/scanner skipped for", emailId);
  } else {
    try {
      const row = await prisma.leadEmail.findUnique({ where: { id: emailId }, select: { clickedAt: true } });
      if (!row) {
        console.log("Click: no leadEmail found for", emailId);
      } else {
        const now = new Date();
        await prisma.leadEmail.update({
          where: { id: emailId },
          data: {
            clickCount: { increment: 1 },
            lastClickedAt: now,
            ...(row.clickedAt ? {} : { clickedAt: now }), // set first-click only once
          },
        });
      }
    } catch (e) {
      console.error("Click tracking error for", emailId, e); // never break the redirect
    }
  }

  // 302 so the click isn't cached (unlike a permanent redirect).
  return NextResponse.redirect(target, { status: 302 });
}
