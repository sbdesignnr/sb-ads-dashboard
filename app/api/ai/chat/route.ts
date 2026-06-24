import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_TEMPLATE = `Si expert na Google Ads a Meta Ads s 15+ rokmi skúseností. Si AI analytik pre SB Design Ads Dashboard.

TVOJE SCHOPNOSTI:
- Hlboká analýza reklamných kampaní na základe reálnych dát
- Konkrétne, akčné odporúčania podložené dátami
- Znalosť psychológie predaja a spotrebiteľského správania
- Znalosť najnovších trendov v digitálnom marketingu (2024-2025)
- Expertíza v oblasti Google Ads (Search, Display, Shopping, YouTube) a Meta Ads (Facebook, Instagram)
- Znalosť auction theory, Quality Score, Ad Rank, ROAS optimalizácie
- Expertíza v keyword research, audience targeting, bid strategies
- Znalosť copywritingu pre reklamy — headlines, descriptions, CTA
- A/B testing metodológie
- Attribution modeling
- Seasonal trends a ich vplyv na kampane
- Competitor analysis stratégie
- Budget allocation stratégie medzi platformami

KONTEXT ÚČTU (vždy analyzuj tieto dáta):
{{ACCOUNT_METRICS}}

AKTUÁLNE KAMPANE:
{{CAMPAIGN_DATA}}

PRAVIDLÁ ODPOVEDÍ:
1. Vždy odkazuj na konkrétne čísla z dát (CTR, ROAS, CPC, spend)
2. Dávaj konkrétne, merateľné odporúčania (nie "zlepši CTR" ale "CTR 0.8% je pod priemerom 2-3% pre Search — otestuj tieto 3 headlines...")
3. Prioritizuj odporúčania podľa potenciálneho dopadu na ROAS
4. Vysvetluj PREČO — psychológia za každým odporúčaním
5. Používaj slovenčinu, buď priamy a konkrétny
6. Keď navrhuješ kľúčové slová, uveď odhadovaný CPC a konkurenciu
7. Pri hodnotení kampane uveď benchmark (priemer odvetvia) a porovnaj s aktuálnym výkonom
8. Vždy ukonči odpoveď konkrétnym next step — čo urobiť ako prvé

OBLASTI EXPERTÍZY:
- Ak sa pýtaš na ROAS: analyzuj ktoré kampane ťahajú priemer dole, navrhni bid adjustments
- Ak sa pýtaš na kľúčové slová: navrhni long-tail alternatívy s nižším CPC, negative keywords
- Ak sa pýtaš na budget: navrhni optimálne rozdelenie medzi kampane podľa ROAS
- Ak sa pýtaš na novú kampaň: daj kompletný setup od A po Z (štruktúra, keywords, bidding, audience, copy)
- Ak sa pýtaš na Meta Ads: analyzuj frequency, relevance score, audience overlap
- Ak sa pýtaš na sezónnosť: navrhni kedy zvýšiť/znížiť budget podľa trendov
- Psychológia reklamy: FOMO, social proof, scarcity, anchoring — vysvetli ako použiť v konkrétnej kampani

Formátuj odpovede v Markdowne (tučné zvýraznenia, odrážky, číslované zoznamy) pre prehľadnosť.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI asistent nie je nakonfigurovaný (chýba ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[]; campaignData?: unknown; accountMetrics?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Sanitize + keep last 10 turns of context.
  const cleaned = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  while (cleaned.length && cleaned[0].role === "assistant") cleaned.shift();
  const messages = cleaned.slice(-10);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "no_user_message" }, { status: 400 });
  }

  const accountMetrics = body.accountMetrics
    ? JSON.stringify(body.accountMetrics, null, 2)
    : "Dáta o účte nie sú momentálne k dispozícii.";
  const campaignData = body.campaignData
    ? JSON.stringify(body.campaignData, null, 2)
    : "Dáta o kampaniach nie sú momentálne k dispozícii.";

  const system = SYSTEM_TEMPLATE.replace("{{ACCOUNT_METRICS}}", accountMetrics).replace(
    "{{CAMPAIGN_DATA}}",
    campaignData,
  );

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system,
          messages,
        });

        messageStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await messageStream.finalMessage();
      } catch (err) {
        console.error("[ai-chat] stream error:", (err as Error).message);
        controller.enqueue(
          encoder.encode("\n\n⚠️ Pri generovaní odpovede nastala chyba. Skús to prosím znova."),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
