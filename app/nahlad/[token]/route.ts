import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = /bot|crawl|spider|preview|scanner|curl|wget|headless|python|go-http|facebookexternalhit|slack|whatsapp|skype/i;

/**
 * GET /nahlad/[token] — VEREJNÝ náhľad navrhnutej domovskej stránky (bez prihlásenia,
 * nehádateľný odkaz, noindex). Otvorenie príjemcom sa počíta (roboty a prihlásený majiteľ nie).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{16,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const row = await prisma.leadMockup.findUnique({ where: { token }, select: { id: true, html: true, status: true } });
  if (!row?.html || row.status !== "done") return new Response("Návrh sa nenašiel.", { status: 404 });
  const ua = req.headers.get("user-agent") ?? "";
  if (!BOT.test(ua)) {
    const session = await auth().catch(() => null);
    if (!session?.user)
      await prisma.leadMockup.update({ where: { id: row.id }, data: { views: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => {});
  }
  const html = row.html.replace("<head>", `<head>\n<meta name="robots" content="noindex,nofollow">`);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
