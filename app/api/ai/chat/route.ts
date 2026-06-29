import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildLiveCampaignContext } from "@/lib/ai/campaign-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BASE_SYSTEM = `Si expert na Google Ads a Meta Ads s 15+ rokmi skúseností. Si AI analytik pre SB Design Ads Dashboard.

TVOJE SCHOPNOSTI:
- Hlboká analýza reklamných kampaní na základe reálnych dát z účtu
- Konkrétne, akčné odporúčania podložené dátami
- Znalosť psychológie predaja a spotrebiteľského správania
- Znalosť najnovších trendov v digitálnom marketingu (2025-2026)
- Expertíza v Google Ads (Search, Display, Shopping, PMax, YouTube) a Meta Ads
- Znalosť auction theory, Quality Score, Ad Rank, ROAS optimalizácie
- Keyword research, audience targeting, bid strategies, copywriting, A/B testing
- Attribution modeling, sezónnosť, competitor analysis, budget allocation

PRAVIDLÁ ODPOVEDÍ:
1. Vždy vychádzaj z REÁLNYCH dát kampaní uvedených v kontexte (názvy, rozpočty, výkon, kľúčové slová, reklamy, geo, konverzie)
2. Dávaj konkrétne, merateľné odporúčania pre KONKRÉTNU kampaň — nie všeobecné rady (nie "zlepši CTR" ale "CTR kampane X je 0,8 %, pod priemerom 2-3 % pre Search — otestuj tieto 3 headlines…")
3. Porovnaj aktuálny stav s odporúčaným (benchmark odvetvia) a navrhni konkrétnu zmenu
4. Prioritizuj odporúčania podľa potenciálneho dopadu na ROAS
5. Vysvetľuj PREČO — psychológia a algoritmus za každým odporúčaním
6. Keď navrhuješ kľúčové slová, uveď odhadovaný CPC a konkurenciu
7. Vždy ukonči odpoveď konkrétnym next step — čo urobiť ako prvé
8. Ak je priložený obrázok/screenshot, analyzuj ho a vzťahuj odporúčania naň
9. Ak sú dáta demo (účet nie je pripojený), upozorni na to, ale pracuj s nimi ako s príkladom
10. Odpovedaj v slovenčine, formátuj v Markdowne (tučné, odrážky, číslované zoznamy)`;

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageCount?: number;
}
interface ImagePayload {
  mediaType: string;
  data: string;
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
  const raw = firstUser?.content.trim() ?? "Nová konverzácia";
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
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

  let body: { chatId?: string | null; messages?: ChatMessage[]; images?: ImagePayload[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Full (text) conversation for persistence.
  const allMessages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim(), imageCount: m.imageCount ?? 0 }));

  // Drop leading assistant turns (e.g. greeting) for the API call.
  const apiBase = [...allMessages];
  while (apiBase.length && apiBase[0].role === "assistant") apiBase.shift();
  const textMsgs = apiBase.slice(-12);

  if (!textMsgs.length || textMsgs[textMsgs.length - 1].role !== "user") {
    return NextResponse.json({ error: "no_user_message" }, { status: 400 });
  }

  // Validate images for the latest user turn.
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((i) => i && typeof i.data === "string" && ALLOWED_MEDIA.includes(i.mediaType))
    .slice(0, 5);
  if (images.length) {
    const last = allMessages[allMessages.length - 1];
    if (last?.role === "user") last.imageCount = images.length;
  }

  // Real-time campaign context (live Google Ads when connected, else mock).
  const ctx = await buildLiveCampaignContext();
  const system = `${BASE_SYSTEM}\n\n=== AKTUÁLNY KONTEXT ÚČTU (automaticky načítané) ===\n${ctx.text}`;

  // Build Anthropic messages, attaching images to the last user turn.
  const imageBlocks = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: img.data,
    },
  }));

  const apiMessages: Anthropic.MessageParam[] = textMsgs.map((m, i) => {
    if (i === textMsgs.length - 1 && m.role === "user" && imageBlocks.length > 0) {
      return {
        role: "user",
        content: [
          ...imageBlocks,
          { type: "text", text: m.content || "Analyzuj priložený obrázok a daj konkrétne odporúčania." },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const chatId = body.chatId && typeof body.chatId === "string" ? body.chatId : crypto.randomUUID();

  const client = new Anthropic();
  const encoder = new TextEncoder();
  let messageStream: ReturnType<typeof client.messages.stream> | null = null;
  let assistantText = "";

  const persist = async () => {
    try {
      const persistedMessages = [
        ...allMessages,
        { role: "assistant", content: assistantText, imageCount: 0 },
      ].slice(-60);
      await prisma.aiChatHistory.upsert({
        where: { id: chatId },
        update: { messages: persistedMessages as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
        create: {
          id: chatId,
          title: deriveTitle(allMessages),
          messages: persistedMessages as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error("[ai-chat] persist failed:", (e as Error).message);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /* client disconnected */
        }
      };
      try {
        messageStream = client.messages.stream(
          { model: "claude-sonnet-4-6", max_tokens: 2000, system, messages: apiMessages },
          { signal: req.signal },
        );
        messageStream.on("text", (text: string) => {
          assistantText += text;
          safeEnqueue(text);
        });
        await messageStream.finalMessage();
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[ai-chat] stream error:", (err as Error).message);
          if (!assistantText) safeEnqueue("\n\n⚠️ Pri generovaní odpovede nastala chyba. Skús to prosím znova.");
        }
      } finally {
        if (assistantText.trim()) await persist();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      messageStream?.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Chat-Id": chatId,
      "X-Context-Source": ctx.source,
    },
  });
}
