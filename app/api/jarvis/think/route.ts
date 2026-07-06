import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// NOTE: lead status is stored as English codes ("new"/"contacted"/"converted"),
// the Slovak words are only display labels — so we query the codes here.
async function buildSystemPrompt(): Promise<string> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    leadsTotal,
    leadsNew,
    leadsContacted,
    leadsConverted,
    leadsToday,
    emailsSent,
    emailsDraft,
    emailsApproved,
    activeCampaigns,
    segments,
    blogPublished,
    blogDraft,
    recentPosts,
    videosCount,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "new" } }),
    prisma.lead.count({ where: { status: "contacted" } }),
    prisma.lead.count({ where: { status: "converted" } }),
    prisma.lead.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.leadEmail.count({ where: { status: "sent" } }),
    prisma.leadEmail.count({ where: { status: "draft" } }),
    prisma.leadEmail.count({ where: { status: "approved" } }),
    prisma.leadCampaign.count({ where: { isActive: true } }),
    prisma.leadSegment.findMany({
      include: { _count: { select: { leads: true } } },
      orderBy: { leads: { _count: "desc" } },
      take: 3,
    }),
    // BlogPost uses a `status` field ("draft" | "published"), not a boolean.
    prisma.blogPost.count({ where: { status: "published" } }),
    prisma.blogPost.count({ where: { status: "draft" } }),
    prisma.blogPost.findMany({ select: { title: true }, orderBy: { createdAt: "desc" }, take: 3 }),
    // The video model is YoutubeVideo.
    prisma.youtubeVideo.count().catch(() => 0),
  ]);

  // No Google Ads spend cache yet — calling the live API on every question would
  // slow Jarvis down, so this stays null until a cached source is wired.
  const googleAdsSpend: number | null = null;

  const topSegments = segments.map((s) => `${s.name} (${s._count.leads})`).join(", ") || "žiadne";
  const recentTitles = recentPosts.map((p) => p.title).filter(Boolean).join(", ") || "žiadne";

  return `Si Jarvis, osobný AI asistent Samuela Bibeňa, zakladateľa SB Design Agency v Nitre, Slovensko.
Odpovedáš VŽDY po slovensky. Maximálne 2-3 vety.
Si priateľský ale stručný a vecný.
Nikdy nevymýšľaj čísla — používaj len dáta ktoré dostaneš.

AKTUÁLNE DÁTA (${new Date().toLocaleDateString("sk-SK")}):
- Leady celkom: ${leadsTotal}
- Nové leady: ${leadsNew}
- Kontaktované: ${leadsContacted}
- Konvertované (klienti): ${leadsConverted}
- Leady dnes: ${leadsToday}
- Emaily odoslané: ${emailsSent}
- Emaily čakajúce na schválenie: ${emailsDraft}
- Schválené emaily: ${emailsApproved}
- Aktívne kampane: ${activeCampaigns}
- Google Ads útrata tento mesiac: ${googleAdsSpend != null ? `${googleAdsSpend}€` : "nedostupné"}
- Top segmenty: ${topSegments}
- Blog článkov celkom: ${blogPublished + blogDraft} (${blogPublished} publikovaných, ${blogDraft} drafty)
- Posledné články: ${recentTitles}
- Videí na YouTube: ${videosCount}

Samuel sa ťa môže pýtať na tieto dáta alebo na všeobecné biznis rady.

Ak sa Samuel pýta na článok, blog, SEO — odpovedaj na základe blog dát.
Ak sa pýta na video, YouTube — odpovedaj na základe video dát.
Ak sa pýta na kampaň, email, lead — odpovedaj na základe lead/email dát.
Ak niečo nevieš alebo nemáš dáta — povedz to priamo, nepridávaj si vlastné čísla.
Vždy odpovedaj v 2-3 vetách maximum.`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });

  let body: { message?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "missing_message" }, { status: 400 });

  try {
    const system = await buildSystemPrompt();
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: message }],
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
