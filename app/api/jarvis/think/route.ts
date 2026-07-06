import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `Si Jarvis, osobný AI asistent Samuela Bibeňa, zakladateľa SB Design Agency v Nitre.
Odpovedáš vždy po slovensky, stručne a vecne. Maximálne 3-4 vety.
Máš prístup k dátam z jeho biznisu — odpovedáš na základe context dát ktoré dostaneš.
Nikdy nevymýšľaj čísla — ak nemáš dáta, povedz to priamo.
Tón: profesionálny ale priateľský, ako skutočný asistent.`;

// lowercase + strip diacritics so keyword intent-matching is robust
function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function buildContext(message: string): Promise<string> {
  const m = fold(message);
  const has = (...words: string[]) => words.some((w) => m.includes(w));
  const parts: string[] = [];

  // Leads / outreach
  if (has("lead", "kampan", "email", "oslov", "outreach")) {
    const [totalLeads, byStatus, sent, opened, drafts, activeCamp] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.groupBy({ by: ["status"], _count: true }),
      prisma.leadEmail.count({ where: { status: "sent" } }),
      prisma.leadEmail.count({ where: { openedAt: { not: null } } }),
      prisma.leadEmail.count({ where: { status: "draft" } }),
      prisma.leadCampaign.count({ where: { isActive: true } }),
    ]);
    const statusStr = byStatus.map((s) => `${s.status}=${s._count}`).join(", ") || "—";
    parts.push(
      `LEADY: spolu ${totalLeads} (${statusStr}). Emaily: odoslaných ${sent}, otvorených ${opened}, draftov ${drafts}. Aktívnych kampaní: ${activeCamp}.`,
    );
  }

  // Google Ads
  if (has("google", "reklama", "klik", "ppc", "cpc", "adwords", "kampan")) {
    try {
      const [{ getCampaignsWithFallback }, { computeTotals }] = await Promise.all([
        import("@/lib/google-ads/campaigns"),
        import("@/lib/utils/metrics"),
      ]);
      const { campaigns, source } = await getCampaignsWithFallback();
      const totals = computeTotals(campaigns.flatMap((c) => c.daily));
      parts.push(
        `GOOGLE ADS (zdroj: ${source}): ${campaigns.length} kampaní, útrata ${totals.spend.toFixed(0)}€, klikov ${totals.clicks}, konverzií ${totals.conversions.toFixed(0)}, CTR ${totals.ctr.toFixed(1)}%.`,
      );
    } catch {
      parts.push("GOOGLE ADS: dáta momentálne nedostupné.");
    }
  }

  // Projects / clients (converted leads)
  if (has("projekt", "klient", "web")) {
    const converted = await prisma.lead.findMany({
      where: { status: "converted" },
      select: { companyName: true, companyCity: true, notes: true },
      take: 15,
    });
    parts.push(
      `KONVERTOVANÍ KLIENTI (${converted.length}): ${
        converted
          .map((c) => `${c.companyName}${c.companyCity ? ` (${c.companyCity})` : ""}${c.notes ? ` — ${c.notes.slice(0, 80)}` : ""}`)
          .join("; ") || "žiadni"
      }.`,
    );
  }

  // Finance (not built yet)
  if (has("kolko", "zarobil", "prijem", "vydavok", "minul", "trzb", "zisk", "faktur")) {
    parts.push("FINANCIE: Finančný modul ešte nie je nastavený.");
  }

  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });

  let body: { message?: string; context?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "missing_message" }, { status: 400 });

  let context = "";
  try {
    context = await buildContext(message);
  } catch {
    context = "";
  }
  const extra = (body.context ?? "").trim();
  const fullContext = [context, extra].filter(Boolean).join("\n") || "(žiadne dáta pre túto otázku)";

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: `KONTEXT DÁTA:\n${fullContext}\n\nOTÁZKA: ${message}` }],
    });
    const response = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({ response });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
