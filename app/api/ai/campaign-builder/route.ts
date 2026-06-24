import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Si expert na Google Ads a Meta Ads s 15+ rokmi skúseností, špecializuješ sa na slovenský a stredoeurópsky trh.

Tvojou úlohou je viesť používateľa cez tvorbu dokonalej reklamnej kampane.

Keď dostaneš odpovede z wizarda, vygeneruj KOMPLETNÝ a KONKRÉTNY campaign setup.

Pravidlá:
1. Buď maximálne konkrétny — žiadne vágne odporúčania
2. Uveď presné čísla (budget rozdelenie, odhadovaný CPA, počet kľúčových slov)
3. Napíš konkrétne ad copies pripravené na copy-paste
4. Vysvetli PREČO každé rozhodnutie — psychológia za ním
5. Zohľadni aktuálne trendy (2025-2026) a algoritmy platforiem
6. Prispôsob odporúčania výške budgetu — pre 100€/mes iný prístup ako pre 1000€/mes
7. Upozorni na časté chyby začiatočníkov
8. Slovenský trh špecifiká vždy zohľadni
9. Odpovedaj v slovenčine

Aktuálne trendy v Google Ads a Meta Ads (2025-2026):

GOOGLE ADS:
- Performance Max kampane dominujú — AI-driven, ale potrebujú kvalitné asset grupy
- Smart Bidding je štandard — Target CPA alebo Target ROAS
- Broad match + Smart Bidding funguje lepšie ako exact match v mnohých prípadoch
- Responsive Search Ads sú povinné — minimum 15 headlines, 4 descriptions
- Google AI Overview ads — nový formát v search results
- First-party data je kľúčová — custom audiences z vlastnej DB
- Video je čoraz dôležitejší aj v Search kampaniach
- Consent Mode v2 je povinný pre európsky trh

META ADS:
- Advantage+ kampane (AI-driven) dosahujú lepší ROAS ako manuálne
- Advantage+ Shopping Catalog pre e-shopy
- Broad targeting funguje lepšie než úzke záujmy v roku 2025
- Video content (Reels) má najnižší CPM
- UGC (user-generated content) konvertuje 4x lepšie než branded content
- Lead Ads s instant forms pre B2B
- WhatsApp integration pre slovenský trh
- iOS tracking obmedzenia — server-side tracking cez Conversion API je nutnosť
- Creative fatigue nastáva rýchlejšie — rotovať kreatívy každé 2-3 týždne

SLOVENSKÝ TRH ŠPECIFIKÁ:
- CPC na Slovensku je 30-50% nižší ako v ZZ krajinách
- Slovenčina vs čeština — testovať oba jazyky
- Peak hours: 7-9 ráno, 12-14 obed, 19-22 večer
- Mobile first — 78% slovenských užívateľov na mobile
- Sezónnosť: január (nový rok motivácia), máj-jún (predletné), november (Black Friday)`;

const GOAL: Record<string, string> = {
  sales: "Predaj produktu/služby",
  leads: "Generovanie leadov",
  awareness: "Brand awareness",
  traffic: "Návštevnosť webu",
};
const DURATION: Record<string, string> = {
  "1week": "1 týždeň",
  "1month": "1 mesiac",
  "3months": "3 mesiace",
  longterm: "Dlhodobo",
};
const PLATFORM: Record<string, string> = {
  google: "Len Google Search",
  meta: "Len Meta (Facebook/Instagram)",
  both: "Google aj Meta",
};
const REMARKETING: Record<string, string> = {
  none: "Žiadne remarketingové publikum",
  pixel: "Facebook Pixel",
  tag: "Google Tag",
  both: "Facebook Pixel aj Google Tag",
};
const TONE: Record<string, string> = {
  professional: "Profesionálny",
  friendly: "Priateľský",
  urgent: "Urgentný",
  luxury: "Luxusný",
};
const CREATIVES: Record<string, string> = {
  have: "Má vlastné obrázky/videá",
  need: "Potrebuje odporúčania na kreatívy",
};
const KPI: Record<string, string> = {
  roas: "ROAS",
  leads: "Počet leadov",
  cpa: "CPA (cena za akciu)",
  traffic: "Návštevnosť webu",
};

interface WizardData {
  goal?: string;
  service?: string;
  audience?: string;
  budget?: number;
  duration?: string;
  platform?: string;
  url?: string;
  remarketing?: string;
  kpi?: string;
  usp?: string;
  tone?: string;
  creatives?: string;
  benefit1?: string;
  benefit2?: string;
  benefit3?: string;
  competitors?: string;
  differentiation?: string;
  competitorKeywords?: string;
}

const v = (val: string | undefined, fallback = "neuvedené") => (val && val.trim() ? val.trim() : fallback);

function buildPrompt(d: WizardData): string {
  const platform = d.platform ?? "both";
  const wantsGoogle = platform === "google" || platform === "both";
  const wantsMeta = platform === "meta" || platform === "both";

  const answers = `ODPOVEDE Z WIZARDA:
- Cieľ kampane: ${GOAL[d.goal ?? ""] ?? v(d.goal)}
- Služba/produkt: ${v(d.service)}
- Cieľová skupina: ${v(d.audience)}
- Mesačný budget: ${d.budget ?? 500} €
- Trvanie: ${DURATION[d.duration ?? ""] ?? v(d.duration)}
- Platforma: ${PLATFORM[platform] ?? platform}
- Webstránka/landing page: ${v(d.url)}
- Remarketingové publikum: ${REMARKETING[d.remarketing ?? ""] ?? v(d.remarketing)}
- KPI: ${KPI[d.kpi ?? ""] ?? v(d.kpi)}
- USP (unique selling proposition): ${v(d.usp)}
- Tón komunikácie: ${TONE[d.tone ?? ""] ?? v(d.tone)}
- Kreatívy: ${CREATIVES[d.creatives ?? ""] ?? v(d.creatives)}
- 3 hlavné benefity: 1) ${v(d.benefit1)} 2) ${v(d.benefit2)} 3) ${v(d.benefit3)}
- Hlavní konkurenti: ${v(d.competitors)}
- Odlíšenie od konkurencie: ${v(d.differentiation)}
- Kľúčové slová konkurencie: ${v(d.competitorKeywords)}`;

  const google = `## GOOGLE ADS SETUP
- Typ kampane a dôvod prečo
- Navrhovaná štruktúra (campaign → ad groups → ads)
- 20 konkrétnych kľúčových slov s match typmi ([exact], "phrase", broad)
- 10 negative keywords
- Bid strategy a dôvod
- Denné rozdelenie budgetu
- Ad schedule (kedy zobrazovať)
- Geo targeting
- 3 kompletné Responsive Search Ads (15 headlines + 4 descriptions každá, pripravené na copy-paste)
- Extensions (sitelinks, callouts, structured snippets)
- Odhadovaný výkon (kliky, konverzie, CPA) pri zadanom budgete`;

  const meta = `## META ADS SETUP
- Campaign objective
- Audience targeting (detailed targeting, interests, behaviors)
- Custom audiences odporúčania
- Ad formats (image, video, carousel, collection)
- Placement odporúčania
- 3 kompletné ad copies (primary text, headline, description, CTA)
- A/B testing plán
- Retargeting stratégia`;

  const sections = [wantsGoogle ? google : "", wantsMeta ? meta : ""].filter(Boolean).join("\n\n");

  return `${answers}

Vygeneruj KOMPLETNÝ campaign setup v markdowne (nadpisy ##, odrážky, tučné zvýraznenia). Začni krátkym zhrnutím stratégie a odôvodnením výberu platformy. Potom vygeneruj nasledujúce sekcie:

${sections}

Na záver pridaj sekciu "## Časté chyby, ktorým sa vyhnúť" a "## Prvé kroky na implementáciu". Buď konkrétny, uveď presné čísla a ad copies pripravené na copy-paste.`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI nie je nakonfigurované (chýba ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let data: WizardData = {};
  try {
    const body = await req.json();
    data = (body?.data ?? {}) as WizardData;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  let messageStream: ReturnType<typeof client.messages.stream> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /* client disconnected — controller already closed */
        }
      };
      try {
        messageStream = client.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildPrompt(data) }],
          },
          { signal: req.signal }, // stop generating if the client disconnects
        );
        messageStream.on("text", (text: string) => safeEnqueue(text));
        await messageStream.finalMessage();
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[campaign-builder] stream error:", (err as Error).message);
          safeEnqueue("\n\n⚠️ Pri generovaní plánu nastala chyba. Skús to prosím znova.");
        }
      } finally {
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
    },
  });
}
