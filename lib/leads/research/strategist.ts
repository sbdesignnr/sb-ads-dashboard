// Výskumný agent pre ponuku a e-mail: (A) kód zozbiera dôkazy, (B) model z nich
// vyvodí zistenia a navrhne ponuku šitú na mieru, (C) KÓD overí, že každý citovaný
// dôkaz naozaj existuje (nepotvrdené tvrdenia sa zahodia), (D) z overených zistení sa
// napíše e-mail (oslovenie z overeného mena, kontrola pravidiel + korektúra).

import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "@prisma/client";
import {
  createMessage,
  EmailQualityError,
  FORMAL_SEGMENT_RE,
  getAiUsage,
  lowerOpener,
  normalizeDashes,
  proofread,
  resetAiUsage,
  textFrom,
  type AiUsage,
} from "../ai";
import { lintEmail } from "../email-quality";
import { buildGreeting } from "../person-name";
import { greetableOwnerName } from "../owner-source";
import { collectEvidence, type EvidenceItem, type EvidencePack } from "./collect";
import { PROCESS, REFERENCES, referencesFor, SERVICES, STARTER_OFFERS } from "./catalog";
import { holdCouncil, type Council, type ScoutNote } from "./council";
import { lessonsBlock } from "@/lib/agents/notes";
import { judgeMails, planMail, type MailCraft, type MailVariantNote, type VariantScore } from "./mailcraft";
import { ANGLES, nicheCard } from "./playbook";

export interface Finding {
  id: string;
  claim: string;
  why_it_matters: string;
  evidence: { eid: string; quote: string; ok: boolean }[];
  verified: boolean;
  /** Výsledok kontrolóra faktov: ok / partial (v maile sa nepoužije) / unsupported (zahodené). */
  audit?: "ok" | "partial" | "unsupported";
  auditNote?: string;
}

export interface OfferPlan {
  name: string;
  deliverable: string;
  why_this: string;
  finding_ids: string[];
  timeline: string;
  risk_reversal: string;
  my_upfront_work: string;
  from_catalog: boolean;
  reference_slug: string | null;
}

export interface AgentResult {
  understanding: string;
  nicheNotes: string;
  findings: Finding[]; // overené
  dropped: Finding[]; // zahodené (citát sa nenašiel v dôkaze)
  offer: OfferPlan | null;
  email: { subject: string; body: string } | null;
  skipReason: string | null;
  /** verejný odkaz na hotový návrh domovskej stránky (ak vznikol) */
  mockupUrl?: string | null;
  /** ako mail vznikol: adresát, varianty uhlov a ich hodnotenie simulovaným adresátom */
  craft?: MailCraft | null;
  /** porada agentov (Miro, Nora, Ateliér) a jej rozhodnutie */
  council?: Council | null;
  pack: EvidencePack;
  usage: AiUsage & { estimatedEur: number };
  issues: string[];
}

/** Model občas vráti pole ako JSON reťazec ("[...]") alebo vôbec — vždy z toho spravíme pole. */
function asArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Rovnako pre objekt, ktorý prišiel ako JSON reťazec. */
function asObject<T extends object>(v: unknown): T | undefined {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as T;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return p && typeof p === "object" && !Array.isArray(p) ? (p as T) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Citát musí byť doslovne (po normalizácii) v dôkaznej položke. */
export function quoteInItem(quote: string, item: EvidenceItem | undefined): boolean {
  if (!item) return false;
  const q = norm(quote);
  if (q.length < 10) return false;
  return norm(item.text).includes(q);
}

const ANALYSIS_SYSTEM = `Si senior stratég pre SB Design (Samuel Bibeň, Nitra: weby na mieru, e-shopy, Meta a Google Ads). Dostaneš DÔKAZY o jednej firme (jej web, Google profil a recenzie, konkurenti v meste, uložená analýza). Úloha: zistiť, čo je pre TÚTO firmu skutočne dôležité, a navrhnúť ponuku šitú na mieru. Píšeš po slovensky.

PRAVIDLÁ
1. Iba overiteľné fakty. Každé zistenie (finding) musí mať 1-3 dôkazy {eid, quote}: quote je DOSLOVNÝ úryvok (5-25 slov, max 220 znakov, bez "…") zo zadanej dôkaznej položky eid. Čo nevieš doložiť úryvkom, netvrď. Žiadne domýšľanie o príjmoch, zákazníkoch či dopade - iba fakty a porovnania z dôkazov.
2. Hľadaj ZAUJÍMAVÉ, nie samozrejmé: čím sa firma odlišuje (z ich textov), čo v recenziách zákazníci chvália alebo kritizujú, kde ich konkurenti v meste predbiehajú (a kde oni predbiehajú konkurentov), čo na webe chýba práve vzhľadom na to, čo o sebe tvrdia, prípadné rozpory. Samozrejmosti platné pre každý web (chýba meta description, HTTPS, PageSpeed) sú len doplnok, nie hlavný argument.
3. 3 až 6 zistení, každé o inej veci; zoradené od najsilnejšieho. "claim" smie obsahovať IBA to, čo priamo vyplýva z citátov (žiadne dodatky, iné firmy ani čísla, ktoré citát nemá); výklad, dôsledky a porovnania patria do "why_it_matters".
4. Ponuka musí byť ŠITÁ NA MIERU: konkrétny výstup (čo presne dostanú), prečo práve tento (odkaz na zistenia), realistický termín, minimálne riziko pre nich (napr. bez záväzku, platia až po schválení), a čo Samuel urobí vopred. Vyber z jeho služieb a štartovacích ponúk (zoznam v zadaní) a prispôsob ich TEJTO firme; ak navrhuješ niečo mimo zoznamu, nastav from_catalog=false. Cenu neuvádzaj.
   Ponuka musí byť pre majiteľa ZAUJÍMAVÁ, konkrétna a JEDNODUCHÁ na prijatie - technické SEO drobnosti (meta popis, štruktúrované dáta) sú iba doplnok, nikdy hlavná ponuka.
   PRED odpoveďou majiteľa sa nevyrába NIČ (žiadny návrh stránky, prototyp ani vizuál): Samuel nevie, či o službu majú záujem, a nechce míňať prácu ani peniaze naprázdno. Preto ponúkaj krok, ktorý sa robí až po odpovedi (krátka konzultácia, písomný rozbor, testovacia kampaň); "my_upfront_work" má byť v podstate nulová práca.
   NESĽUBUJ výsledky, ktoré nemáš pod kontrolou: poradie v Google, hviezdičky vo vyhľadávaní (Google ich pri vlastných recenziách firmy cez schema.org nezobrazuje), návštevnosť, počet dopytov ani tržby. Sľubuješ iba to, čo Samuel dodá (ukážku, prototyp, opravu).
   Tvrdenie, že na webe niečo CHÝBA alebo je PRÁZDNE, smieš uviesť iba ak to dokazuje technický údaj zistený kódom (položka "Technické vlastnosti webu") alebo výslovný text. Z toho, že sme v texte stránky nič nenašli, to netvrď - obsah môže byť načítaný cez JavaScript, PDF alebo obrázky.
5. Ak je v zadaní referencia z rovnakého odboru, použi ju (reference_slug); inak null.
6. niche_notes: 2-3 vety všeobecnej znalosti o tom, ako si zákazníci v tomto odbore vyberajú poskytovateľa - je to len kontext (neoverené), nie tvrdenie o firme.
Výsledok vlož VÝHRADNE cez nástroj "uloz_analyzu".`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "uloz_analyzu",
  description: "Uloží zistenia a návrh ponuky.",
  input_schema: {
    type: "object",
    properties: {
      skip_reason: { type: ["string", "null"], description: "Ak firma nie je vhodná na oslovenie (veľký koncern, verejná inštitúcia…), dôvod; inak null." },
      understanding: { type: "string", description: "2-4 vety: čo firma robí, komu a čím sa odlišuje - len z dôkazov." },
      niche_notes: { type: "string", description: "2-3 vety všeobecného kontextu odboru (neoverené)." },
      findings: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "F1, F2…" },
            claim: { type: "string", description: "Jedno konkrétne tvrdenie o firme." },
            why_it_matters: { type: "string", description: "Prečo je to pre ňu dôležité (bez vymyslených čísel)." },
            evidence: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  eid: { type: "string", description: "id dôkaznej položky, napr. E3" },
                  quote: { type: "string", description: "DOSLOVNÝ úryvok z tej položky" },
                },
                required: ["eid", "quote"],
              },
            },
          },
          required: ["id", "claim", "why_it_matters", "evidence"],
        },
      },
      offer: {
        type: "object",
        properties: {
          name: { type: "string", description: "Krátky názov ponuky" },
          deliverable: { type: "string", description: "Čo presne dostanú" },
          why_this: { type: "string", description: "Prečo práve toto pre nich (odkaz na zistenia)" },
          finding_ids: { type: "array", items: { type: "string" }, description: "Zistenia, na ktorých ponuka stojí" },
          timeline: { type: "string", description: "Realistický termín" },
          risk_reversal: { type: "string", description: "Prečo je pre nich bez rizika" },
          my_upfront_work: { type: "string", description: "Čo Samuel urobí vopred" },
          from_catalog: { type: "boolean" },
          reference_slug: { type: ["string", "null"] },
        },
        required: ["name", "deliverable", "why_this", "finding_ids", "timeline", "risk_reversal", "my_upfront_work", "from_catalog"],
      },
    },
    required: ["skip_reason", "understanding", "niche_notes", "findings", "offer"],
  } as Anthropic.Tool.InputSchema,
};

const EMAIL_SYSTEM = `Si Samuel Bibeň, web developer z Nitry. Píšeš krátky osobný e-mail majiteľovi firmy - ako človek človeku, nie ako agentúra. Meno adresáta nepoznáš: oslovenie a podpis pridá systém, ty píšeš IBA odseky (bez "Dobrý deň", bez podpisu, bez mena, bez slov "pán/pani/konateľ"). Vždy po slovensky.

DOSTANEŠ overené zistenia o ich firme a návrh ponuky. Z toho napíš e-mail, ktorý znie, akoby si sa naozaj pozrel práve na nich.

ŠTÝL (dôležité - žiadny "AI" tón)
- MAX 5 viet, spolu 45-90 slov (viac ako 100 sa neschváli), 2-3 krátke odseky. Jedna hlavná myšlienka, jedna ponuka. Ponuku zhrň JEDNOU vetou - podrobnosti (čo presne obsahuje, ako to vzniká) pošleš, keď odpovedia.
- Prvá veta je konkrétny fakt o NICH z overených zistení (nie o webe všeobecne). Prvý odsek začni malým písmenom (nadväzuje na oslovenie s čiarkou), okrem vlastného mena, značky alebo domény.
- Ponuku uveď priamo a konkrétne: čo dostanú a dokedy, a že pre nich nie je žiadne riziko. Referenciu NESPOMÍNAJ - pridá ju systém ako odkaz na konci. Číslo dní uveď tak, ako je v termíne ponuky.
- Záver = jedna konkrétna veta o ďalšom kroku (napr. "Stačí odpísať a dohodneme si krátky hovor."), NIE otázka na názor. Žiadne dni v týždni ani dátumy; termín iba ten z ponuky.
- Píš jednoducho, hovorovo-spisovne. Krátke a dlhšie vety striedaj. Konkrétne podstatné mená namiesto prívlastkov.
- ZAKÁZANÉ otvárania a frázy: "všimol som si", "pozrel som sa na Váš web", pochvala v prvej vete ("slušná vizitka", "naozaj skvelé"), "viem, čo v tomto odbore funguje", "rád by som", "dovoľte mi". Nehodnoť ich vopred - fakty nech hovoria samy.
- ZAKÁZANÉ "AI" vzory: trojice vymenovaní ("A, B a C"), "nielen X, ale aj Y", "Keď X, tak Y", "To znamená, že…", rétorické otázky, superlatívy a prívlastky ("výnimočný", "kľúčový", "komplexný"), otváracie otázky, zovšeobecnenia o skupine ľudí, "odíde ku konkurencii", "časť záujemcov".
- Čísla iba z overených zistení (napr. "z ôsmich ambulancií v Nitre má online objednávanie šesť"), inak žiadne čísla, percentá ani sumy. Cenu neuvádzaj.
- Píš ľudsky, nie technicky: žiadne názvy technológií, verzie a skratky (PHP, CMS, WordPress verzie, "PageSpeed 44"), ktorým majiteľ firmy nerozumie. Povedz dôsledok, ktorý pozná (web je z roku X, na mobile sa zle číta, formulár chýba).
- Žiadne poučky a všeobecné múdrosti po fakte ("dôvera sa buduje roky", "to je presne ten druh…"): po fakte hneď konkrétny dôsledok pre NICH.

Zistenia NEPREBERAJ doslova - povedz ich po svojom. Zakázané frázy: "pôsobí zastarano", "zastaraný web", "chýba kontaktný formulár", "chýba rezervačný systém", "moderný web", "profesionálny web", "online prítomnosť", "komplexný".
PRAVDIVOSŤ: používaj IBA overené zistenia a ponuku zo zadania. Nič nevymýšľaj.
JAZYK: vykanie (Vy, Vás, Vám, Váš… VŽDY s veľkým V; slovesá v množnom čísle: "mali by ste"). Si MUŽ ("pozrel som", "pripravím"). Iba obyčajná pomlčka "-", úvodzovky slovenské „takto“.
Predmet: 2-4 slová malými písmenami, obsahuje doménu alebo konkrétny nález.
Výsledok vlož VÝHRADNE cez nástroj "uloz_email".`;

const EMAIL_TOOL: Anthropic.Tool = {
  name: "uloz_email",
  description: "Uloží predmet a odseky e-mailu (bez oslovenia a podpisu).",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      paragraphs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
      used_findings: { type: "array", items: { type: "string" }, description: "id zistení, ktoré e-mail používa" },
    },
    required: ["subject", "paragraphs", "used_findings"],
  } as Anthropic.Tool.InputSchema,
};

/**
 * Kontrolór faktov: kód overil len CITÁTY; toto overí, či zistenie ako CELOK vyplýva
 * z dôkazov (napr. že claim netvrdí aj niečo o konkurentoch, čo citát nedokazuje).
 * Nepodložené zistenia sa zahodia, čiastočne podložené sa nepoužijú v maile.
 */
async function auditClaims(
  client: Anthropic,
  findings: Finding[],
  pack: EvidencePack,
): Promise<Map<string, { verdict: "ok" | "partial" | "unsupported"; note: string }>> {
  const byId = new Map(pack.items.map((i) => [i.id, i]));
  const cited = [...new Set(findings.flatMap((f) => f.evidence.map((e) => e.eid)))];
  const evidenceText = cited
    .map((id) => byId.get(id))
    .filter((i): i is EvidenceItem => Boolean(i))
    .map((i) => `=== ${i.id} ${i.title} ===\n${i.text.slice(0, 7000)}`)
    .join("\n\n");
  const claims = findings.map((f) => `${f.id}: ${f.claim}`).join("\n");
  const msg = await createMessage(client, {
    model: process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5",
    max_tokens: 900,
    temperature: 0,
    system:
      'Si prísny kontrolór faktov. Dostaneš dôkazy a zistenia. Pre KAŽDÉ zistenie posúď, či ho dôkazy PRIAMO potvrdzujú v celom rozsahu: "ok" = celé tvrdenie je v dôkazoch; "partial" = časť tvrdenia (napr. údaj o inej firme, číslo, dôsledok) v dôkazoch nie je; "unsupported" = dôkazy tvrdenie nepotvrdzujú. Interpretácia ("čo to znamená") sa nehodnotí, len fakty. Tvrdenie, že niečo na webe "chýba" alebo je "prázdne", je "ok" iba ak to dokazuje technický údaj zistený kódom alebo výslovný text; ak sa opiera len o to, že v texte stránky nič nebolo, je to "partial". Odpovedz VÝHRADNE JSON poľom: [{"id":"F1","verdict":"ok|partial|unsupported","note":"stručne"}]',
    messages: [{ role: "user", content: `DÔKAZY:\n${evidenceText}\n\nZISTENIA:\n${claims}` }],
  });
  const out = new Map<string, { verdict: "ok" | "partial" | "unsupported"; note: string }>();
  const m = textFrom(msg).match(/\[[\s\S]*\]/);
  if (m) {
    try {
      for (const r of JSON.parse(m[0]) as { id?: string; verdict?: string; note?: string }[])
        if (r.id && (r.verdict === "ok" || r.verdict === "partial" || r.verdict === "unsupported"))
          out.set(r.id, { verdict: r.verdict, note: String(r.note ?? "").slice(0, 300) });
    } catch {
      /* neplatný JSON → bez auditu berieme len citátovú kontrolu */
    }
  }
  return out;
}

function renderPack(pack: EvidencePack): string {
  return pack.items
    .map((i) => `=== ${i.id} [${i.kind}] ${i.title} | zdroj: ${i.source} ===\n${i.text}`)
    .join("\n\n");
}

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/g, ""));
}

/**
 * Napíše cold e-mail z overených zistení a ponuky (oslovenie z overeného mena, lint, korektúra,
 * odkaz na návrh stránky). Používa ho beh agenta aj "napísať mail znova" (napr. po vyrobení návrhu).
 */
export async function writeOutreachEmail(input: {
  client: Anthropic;
  lead: Lead;
  segmentName: string;
  findings: Finding[];
  offer: OfferPlan;
  /** dôkazné položky (id + text) — z nich sa overuje, že čísla v maile majú oporu */
  evidence: { id: string; text: string }[];
  mockupUrl?: string | null;
  /** rozhodnutie porady (dôraz a uhol), ak porada prebehla */
  guidance?: string;
  /** false = úsporný režim: jeden pokus podľa pôvodného postupu bez plánu uhlov a variantov */
  craft?: boolean;
}): Promise<{ email: { subject: string; body: string } | null; issues: string[]; craft: MailCraft | null }> {
  const { client, lead, segmentName, findings, offer, evidence } = input;
  const mockupUrl = input.mockupUrl ?? null;
  const issues: string[] = [];
  // Do e-mailu idú iba úplne podložené zistenia (audit "ok"); "partial" ostáva len v správe.
  const mailFindings = findings.filter((f) => f.audit !== "partial");
  const usedFacts = mailFindings
    .map((f) => `${f.id}: ${f.claim} (dôkaz: „${f.evidence[0].quote}“)`)
    .join("\n");
  const refLine = offer.reference_slug ? REFERENCES.find((r) => r.slug === offer.reference_slug) : null;
  const offerBlock = mockupUrl
    ? `NÁVRH PONUKY:\nNázov: Hotový návrh novej domovskej stránky\nČo dostanú: UŽ HOTOVÝ klikateľný návrh novej domovskej stránky ich firmy, postavený z ICH vlastných textov a fotiek. Odkaz na návrh pridá systém pod mail, v texte ho neuvádzaj.\nPrečo práve toto: ${offer.why_this}\nTermín: návrh je hotový už teraz\nBez rizika: návrh je zadarmo a bez záväzku\nČo urobím vopred: návrh je už urobený\n\nPOZOR: návrh je HOTOVÝ. Píš v minulom čase ("pripravil som", "urobil som"), nie "pripravím". Ukáž, že si na nich už pracoval: povedz 1 konkrétnu vec, ktorú návrh zvýrazňuje (z overených zistení, napr. ich recenzie alebo služby), a že odkaz je pod mailom. Záver: pokojná veta, že ak sa im páči, ozvú sa.`
    : `NÁVRH PONUKY:\nNázov: ${offer.name}\nČo dostanú: ${offer.deliverable}\nPrečo práve toto: ${offer.why_this}\nTermín: ${offer.timeline}\nBez rizika: ${offer.risk_reversal}\nČo urobím vopred: ${offer.my_upfront_work}`;
  const emailFacts = `FIRMA: ${lead.companyName} (${lead.companyCity ?? "?"}), odvetvie: ${segmentName}\nWeb: ${lead.websiteUrl ?? "—"}\n\nOVERENÉ ZISTENIA (jediný zdroj faktov):\n${usedFacts}\n\n${offerBlock}\nReferencia z ich odboru: ${refLine ? `web pre „${refLine.client}“` : "žiadna"}${
    offer.finding_ids.some((id) => !mailFindings.some((f) => f.id === id))
      ? "\n\nPOZOR: niektoré zistenia, o ktoré sa ponuka opiera, sa nepodarilo overiť. Spomeň v maile iba overené zistenia vyššie a v ponuke iba to, čo z nich vyplýva."
      : ""
  }`;

  // Otvorenie e-mailu sa strieda podľa leadu, aby maily nemali všetky rovnakú kostru (záložný režim
  // bez plánu uhlov).
  const OPENINGS = [
    "Prvá veta = konkrétna vec z ich vlastného webu alebo cenníka (nie hodnotenie ani počet recenzií).",
    "Prvá veta = čo o nich píšu zákazníci v recenziách (ak je takéto overené zistenie), inak konkrétna vec z ich webu.",
    "Prvá veta = porovnanie s konkurentmi v meste s presným číslom zo zistení.",
    "Prvá veta = rozpor medzi tým, čo o sebe tvrdia, a tým, čo web reálne ukazuje.",
  ];
  const seed = [...lead.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const openingHint = OPENINGS[seed % OPENINGS.length];
  const greeting = buildGreeting(greetableOwnerName(lead));
  const formal = greeting.formal || FORMAL_SEGMENT_RE.test(segmentName);
  const signoff = formal ? "S úctou," : "S pozdravom,";
  const niche = nicheCard(segmentName);
  const byItem = new Map(evidence.map((i) => [i.id, i]));

  interface Draft {
    angle: string;
    subject: string;
    paragraphs: string[];
    lintErrors: string[];
    guidance: string;
  }
  /** Jeden návrh mailu podľa pokynu (uhol alebo záložné otvorenie); kód skontroluje pravidlá. */
  const draftMail = async (guidance: string, feedback: string, angle: string): Promise<Draft | null> => {
    const msg = await createMessage(client, {
      model: process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5",
      max_tokens: 700,
      temperature: 0.8,
      system: EMAIL_SYSTEM,
      tools: [EMAIL_TOOL],
      tool_choice: { type: "tool", name: "uloz_email" },
      messages: [{ role: "user", content: `${emailFacts}\n\nKARTA ODBORU (${niche.name}; všeobecná znalosť, NIE fakty o firme):\n${niche.card}\n\n${guidance}\n\nDĹŽKA: spolu 55 až 90 slov (viac ako 100 slov sa zamietne). Nie je to výpočet výhod, je to krátky osobný mail.\n\nNapíš e-mail.${feedback}` }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const d = (block?.input ?? {}) as { subject?: string; paragraphs?: unknown; used_findings?: string[] };
    const subject = normalizeDashes(String(d.subject ?? "").trim()).slice(0, 120).toLowerCase();
    const paragraphs = Array.isArray(d.paragraphs) ? d.paragraphs.map((p) => normalizeDashes(String(p).trim())).filter(Boolean) : [];
    if (!subject || !paragraphs.length) return null;
    const used = mailFindings.filter((f) => asArray<string>(d.used_findings).includes(f.id));
    // Číslo smie byť v maile, ak ho zistenie uvádza A zároveň je v plnom texte niektorej z
    // dôkazných položiek, ktoré cituje (napr. "79" recenzií je v Google profile).
    const allowedNumbers = used.flatMap((f) => {
      const inEvidence = new Set(f.evidence.flatMap((e) => numbersIn(byItem.get(e.eid)?.text ?? "")));
      return [...numbersIn(f.claim), ...f.evidence.flatMap((e) => numbersIn(e.quote))].filter((n) => inEvidence.has(n));
    });
    // čísla z podmienok ponuky (napr. "15-20 minút", "5-7 dní") sú z katalógu, nie vymyslené
    allowedNumbers.push(...numbersIn(offer.timeline), ...numbersIn(offer.deliverable), ...numbersIn(offer.risk_reversal));
    const allowedYears = allowedNumbers.filter((n) => /^(19|20)\d{2}$/.test(n)).map(Number);
    const res = lintEmail({ kind: "initial", subject, paragraphs, copyrightYear: lead.copyrightYear, allowedYears, allowedNumbers });
    lintCtx.set(`${angle}|${subject}`, { allowedYears, allowedNumbers });
    return { angle, subject, paragraphs, lintErrors: res.errors, guidance };
  };
  const lintCtx = new Map<string, { allowedYears: number[]; allowedNumbers: string[] }>();
  const relint = (d: Draft, paragraphs: string[]) => {
    const ctx = lintCtx.get(`${d.angle}|${d.subject}`) ?? { allowedYears: [], allowedNumbers: [] };
    return lintEmail({ kind: "initial", subject: d.subject, paragraphs, copyrightYear: lead.copyrightYear, ...ctx });
  };
  const assemble = (subject: string, paragraphs: string[]) => {
    const body = [
      greeting.line,
      lowerOpener(paragraphs[0], lead.companyName),
      ...paragraphs.slice(1).map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
      ...(mockupUrl ? [`Návrh Vašej novej domovskej stránky: ${mockupUrl}`] : []),
      ...(refLine && !mockupUrl ? [`Ukážka mojej práce z Vášho odboru: ${refLine.url}`] : []),
      `${signoff}\nSamuel Bibeň`,
    ].join("\n\n");
    return { subject, body };
  };

  // 1) plán: kto číta a tri rôzne uhly
  const plan = input.craft === false ? null : await planMail(client, { companyName: lead.companyName, city: lead.companyCity, segmentName, findings: mailFindings, offer, mockupReady: Boolean(mockupUrl), guidance: input.guidance });
  let candidates: Draft[] = [];
  if (plan) {
    const drafts = await Promise.all(
      plan.angles.map(async (a) => {
        const label = ANGLES.find((x) => x.id === a.angle);
        const guidance = `UHOL TOHTO MAILU: ${label?.label}. ${label?.how}\nOpri sa o zistenie ${a.finding_id}. Obsah prvej vety: ${a.opening}\nNajpravdepodobnejšia námietka adresáta: „${a.objection}“. Zmier ju JEDNOU vetou VLASTNÝMI SLOVAMI, prirodzene a ľudsky (nekopíruj túto formuláciu doslova, bez vymyslených faktov): ${a.defusal}\nInšpirácia pre predmet: ${a.subject_idea}\nAdresát: ${plan.recipient}`;
        let d = await draftMail(guidance, "", a.angle);
        if (d && d.lintErrors.length) {
          issues.push(`variant „${a.angle}“ zamietnutý pravidlami: ${d.lintErrors.join("; ")}`);
          d = await draftMail(guidance, `\n\nPREDCHÁDZAJÚCI POKUS BOL ZAMIETNUTÝ: ${d.lintErrors.join("; ")}. Oprav a dodrž všetky pravidlá.`, a.angle);
        }
        return d;
      }),
    );
    candidates = drafts.filter((d): d is Draft => Boolean(d && !d.lintErrors.length));
  }

  // 2) korektúra a kontrola faktov KAŽDÉHO variantu (paralelne). Simulovaný adresát nevie overiť, či je
  //    tvrdenie pravdivé, a vymyslený konkrétny detail by ohodnotil najlepšie; preto do výberu idú len
  //    varianty, ktoré prešli kontrolou pravdivosti.
  const rejectedNotes: MailVariantNote[] = [];
  const proofed = await Promise.all(
    candidates.map(async (c): Promise<Draft | null> => {
      const pr = await proofread(client, emailFacts, c.subject, c.paragraphs);
      if (!pr || pr.verdict === "reject") {
        const why = pr?.problems?.length ? pr.problems.join("; ") : "korektor nevrátil výsledok";
        issues.push(`variant „${c.angle}“: korektor zamietol (${why})`);
        rejectedNotes.push({ angle: c.angle, subject: c.subject, preview: c.paragraphs[0].slice(0, 200), lintErrors: [`Kontrola pravdivosti: ${why}`.slice(0, 300)], score: null, chosen: false });
        return null;
      }
      let paragraphs = c.paragraphs;
      if (pr.verdict === "fixed") {
        const fixed = pr.paragraphs.map((p) => normalizeDashes(p.trim())).filter(Boolean);
        if (fixed.length === paragraphs.length) paragraphs = fixed;
      }
      const res = relint(c, paragraphs);
      if (res.errors.length) {
        issues.push(`variant „${c.angle}“ po korektúre: ${res.errors.join("; ")}`);
        rejectedNotes.push({ angle: c.angle, subject: c.subject, preview: c.paragraphs[0].slice(0, 200), lintErrors: res.errors, score: null, chosen: false });
        return null;
      }
      return { ...c, paragraphs };
    }),
  );
  candidates = proofed.filter((c): c is Draft => Boolean(c));

  // 3) simulovaný adresát vyberie najlepší z pravdivých variantov
  let ranking = candidates.map((_, i) => i);
  let scores: (VariantScore | null)[] = candidates.map(() => null);
  let verdict = "";
  if (candidates.length >= 2 && plan) {
    const judged = await judgeMails(
      client,
      plan.recipient,
      segmentName,
      candidates.map((c) => ({ angle: c.angle, subject: c.subject, body: c.paragraphs.join("\n\n") })),
      seed,
    );
    if (judged) {
      scores = judged.scores;
      verdict = judged.verdict;
      ranking = ranking.sort((a, b) => (scores[b]?.total ?? -1e9) - (scores[a]?.total ?? -1e9));
    }
  }
  let email: AgentResult["email"] = null;
  let chosen = -1;
  if (ranking.length) {
    chosen = ranking[0];
    email = assemble(candidates[chosen].subject, candidates[chosen].paragraphs);
  }

  // 4) záloha: pôvodný sekvenčný režim (jeden pokyn, spätná väzba z pravidiel a korektúry)
  let emailFeedback = "";
  for (let attempt = 1; attempt <= 3 && !email; attempt++) {
    const d = await draftMail(openingHint + " (ak na to nemáš overené zistenie, zvoľ najsilnejšie iné).", emailFeedback, "zaloha");
    if (!d) continue;
    if (d.lintErrors.length) {
      emailFeedback = `\n\nPREDCHÁDZAJÚCI POKUS BOL ZAMIETNUTÝ: ${d.lintErrors.join("; ")}. Oprav a dodrž všetky pravidlá.`;
      issues.push(`e-mail pokus ${attempt}: ${d.lintErrors.join("; ")}`);
      continue;
    }
    const pr = await proofread(client, emailFacts, d.subject, d.paragraphs);
    if (!pr || pr.verdict === "reject") {
      emailFeedback = `\n\nKOREKTOR ZAMIETOL: ${(pr?.problems ?? ["nevrátil výsledok"]).join("; ")}. Oprav.`;
      issues.push(`e-mail pokus ${attempt}: korektor zamietol`);
      continue;
    }
    let paragraphs = d.paragraphs;
    if (pr.verdict === "fixed") {
      const fixed = pr.paragraphs.map((p) => normalizeDashes(p.trim())).filter(Boolean);
      if (fixed.length === paragraphs.length) paragraphs = fixed;
    }
    const res = relint(d, paragraphs);
    if (res.errors.length) {
      emailFeedback = `\n\nPO KOREKTÚRE ZAMIETNUTÉ: ${res.errors.join("; ")}.`;
      issues.push(`e-mail pokus ${attempt} po korektúre: ${res.errors.join("; ")}`);
      continue;
    }
    email = assemble(d.subject, paragraphs);
  }
  if (!email) issues.push("E-mail sa nepodarilo napísať tak, aby prešiel kontrolou kvality.");

  const craft: MailCraft | null = plan
    ? {
        recipient: plan.recipient,
        verdict,
        variants: [
          ...candidates.map((c, i) => ({
            angle: c.angle,
            subject: c.subject,
            preview: c.paragraphs[0].slice(0, 200),
            lintErrors: c.lintErrors,
            score: scores[i],
            chosen: i === chosen,
          })),
          ...rejectedNotes,
        ],
      }
    : null;
  return { email, issues, craft };
}

export async function runResearchAgent(input: {
  lead: Lead;
  segmentName: string;
  keywords: string[];
  onStep?: (msg: string) => void;
  /**
   * Volá sa po overení zistení a pred písaním mailu: Ateliér môže vyrobiť hotový návrh
   * domovskej stránky. Vráti jeho verejný odkaz (mail potom nesľubuje, ale ukazuje hotovú vec).
   */
  beforeEmail?: (ctx: { findings: Finding[]; offer: OfferPlan; pack: EvidencePack; council: Council | null }) => Promise<{ url: string } | null>;
  /** poznámka Skauta (Miro): prečo tento lead a čím ho osloviť */
  scoutNote?: ScoutNote | null;
  /** hlboký režim: porada Miro + Nora pred písaním mailu (dôraz, uhol, námietka); ≈ +0,03 € */
  deep?: boolean;
  /** false = mail iba jedným pokusom (bez troch variantov a simulovaného adresáta); predvolene sa varianty robia vždy */
  craft?: boolean;
}): Promise<AgentResult> {
  const { lead, segmentName } = input;
  const step = input.onStep ?? (() => {});
  resetAiUsage();
  const issues: string[] = [];
  const client = new Anthropic();

  // A) dôkazy (kód, bez AI)
  step("Zbieram dôkazy: web firmy, Google profil, konkurenti v meste…");
  const pack = await collectEvidence({ lead, segmentName, keywords: input.keywords });
  step(`Zozbieraných ${pack.items.length} dôkazových položiek${pack.notes.length ? ` (nepodarilo sa: ${pack.notes.join(" ")})` : ""}`);

  const refs = referencesFor(segmentName);
  const catalog = `MOJE SLUŽBY:\n${SERVICES.map((s) => `- ${s.name}: ${s.what}`).join("\n")}\nPROCES: ${PROCESS}\nŠTARTOVACIE PONUKY (vyber a prispôsob; každá vyžaduje Samuelov súhlas):\n${STARTER_OFFERS.map((o, i) => `${i + 1}. ${o}`).join("\n")}\nREFERENCIE Z ICH ODBORU (slug | klient | odbor): ${refs.length ? refs.map((r) => `${r.slug} | ${r.client} | ${r.industry}`).join("; ") : "žiadna"}${
    input.scoutNote
      ? `\nPOZNÁMKA SKAUTA MIRA (jeho odhad z dát, NIE overený fakt o firme): fit ${input.scoutNote.fit ?? "?"}/10, ${input.scoutNote.verdict} Návrh ako osloviť: ${input.scoutNote.hint || "—"}`
      : ""
  }\n\nKARTA ODBORU (${nicheCard(segmentName).name}; všeobecná znalosť o tom, ako sa v odbore rozhoduje, NIE fakty o firme):\n${nicheCard(segmentName).card}${await lessonsBlock("nora").catch(() => "")}`;

  // B) analýza + ponuka (jedno volanie s celým balíkom)
  let findings: Finding[] = [];
  let dropped: Finding[] = [];
  let offer: OfferPlan | null = null;
  let understanding = "";
  let nicheNotes = "";
  let skipReason: string | null = null;
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    step(attempt === 1 ? "Vyhodnocujem dôkazy a navrhujem ponuku…" : "Opakujem analýzu (predošlá nemala dosť overených zistení)…");
    const msg = await createMessage(client, {
      model: process.env.LEADS_AGENT_MODEL?.trim() || "claude-sonnet-5",
      max_tokens: 3500,
      temperature: 0.4,
      system: ANALYSIS_SYSTEM,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "uloz_analyzu" },
      messages: [
        {
          role: "user",
          content: `FIRMA: ${lead.companyName} | mesto: ${lead.companyCity ?? "?"} | odvetvie: ${segmentName}\n\nDÔKAZY (jediný zdroj faktov o firme):\n${renderPack(pack)}\n\n${catalog}${feedback}`,
        },
      ],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const d = (block?.input ?? {}) as {
      skip_reason?: string | null;
      understanding?: string;
      niche_notes?: string;
      findings?: { id?: string; claim?: string; why_it_matters?: string; evidence?: { eid?: string; quote?: string }[] }[];
      offer?: Partial<OfferPlan>;
    };
    if (d.skip_reason) {
      skipReason = String(d.skip_reason);
      break;
    }
    understanding = d.understanding ?? "";
    nicheNotes = d.niche_notes ?? "";
    const byId = new Map(pack.items.map((i) => [i.id, i]));
    const all: Finding[] = asArray<NonNullable<typeof d.findings>[number]>(d.findings).map((f, i) => {
      const evidence = asArray<{ eid?: string; quote?: string }>(f.evidence).map((e) => ({
        eid: String(e.eid ?? ""),
        quote: String(e.quote ?? "").trim(),
        ok: quoteInItem(String(e.quote ?? ""), byId.get(String(e.eid ?? ""))),
      }));
      return {
        id: f.id || `F${i + 1}`,
        claim: String(f.claim ?? "").trim(),
        why_it_matters: String(f.why_it_matters ?? "").trim(),
        evidence,
        // zistenie platí, len ak sú VŠETKY jeho citáty overené
        verified: evidence.length > 0 && evidence.every((e) => e.ok),
      };
    });
    findings = all.filter((f) => f.verified);
    dropped = all.filter((f) => !f.verified);
    if (findings.length) {
      step("Kontrolujem, či tvrdenia naozaj vyplývajú z dôkazov…");
      const audit = await auditClaims(client, findings, pack);
      for (const f of findings) {
        const a = audit.get(f.id);
        f.audit = a?.verdict ?? "ok";
        f.auditNote = a?.note;
        if (f.audit === "unsupported") f.verified = false;
      }
      dropped = [...dropped, ...findings.filter((f) => !f.verified)];
      findings = findings.filter((f) => f.verified);
    }
    const o = asObject<Partial<OfferPlan>>(d.offer);
    const okIds = asArray<string>(o?.finding_ids).filter((id) => findings.some((f) => f.id === id));
    if (o && okIds.length) {
      offer = {
        name: String(o.name ?? ""),
        deliverable: String(o.deliverable ?? ""),
        why_this: String(o.why_this ?? ""),
        finding_ids: okIds,
        timeline: String(o.timeline ?? ""),
        risk_reversal: String(o.risk_reversal ?? ""),
        my_upfront_work: String(o.my_upfront_work ?? ""),
        from_catalog: o.from_catalog !== false,
        reference_slug: refs.some((r) => r.slug === o.reference_slug) ? (o.reference_slug as string) : null,
      };
    } else offer = null;
    if (findings.length >= 2 && offer) break;
    feedback = `\n\nPREDCHÁDZAJÚCI POKUS NEMAL DOSŤ OVERENÝCH ZISTENÍ (overených ${findings.length}, zahodených ${dropped.length}: ${dropped.map((f) => f.evidence.filter((e) => !e.ok).map((e) => `${e.eid}: "${e.quote.slice(0, 60)}"`).join(", ")).join(" | ")}). Citáty musia byť DOSLOVNÉ úryvky zo zadaných položiek. Ponuka musí stáť na overených zisteniach.`;
    issues.push(`pokus ${attempt}: ${findings.length} overených zistení, ponuka ${offer ? "ok" : "chýba"}`);
  }
  if (skipReason || findings.length < 2 || !offer)
    return {
      understanding, nicheNotes, findings, dropped, offer, email: null,
      skipReason: skipReason ?? "Nepodarilo sa zostaviť aspoň 2 overené zistenia a ponuku.",
      pack, usage: getAiUsage(), issues,
    };
  step(`Overené zistenia: ${findings.length}, zahodených (nedoložených): ${dropped.length}`);

  // C1) porada agentov: Miro, Nora a Ateliér sa dohodnú na dôraze, smere dizajnu a uhle mailu
  let council: Council | null = null;
  if (input.deep) {
    step("Porada: Miro a Nora vymieňajú názory…");
    council = await holdCouncil(client, { companyName: lead.companyName, city: lead.companyCity, segmentName, scout: input.scoutNote ?? null, understanding, findings, offer });
    if (!council) issues.push("porada agentov sa nepodarila (pokračuje sa bez nej)");
  }

  // C2) hotový návrh domovskej stránky (voliteľné) — z ponuky sa stane hotová vec, nie sľub
  let mockupUrl: string | null = null;
  if (input.beforeEmail) {
    step("Ateliér: navrhuje novú domovskú stránku…");
    try {
      mockupUrl = (await input.beforeEmail({ findings, offer, pack, council }))?.url ?? null;
    } catch (e) {
      issues.push(`návrh stránky zlyhal: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // D) e-mail z overených zistení
  step("Píšem e-mail z overených zistení…");
  const guidance = council
    ? [
        `Dôraz: ${council.decision.offerFocus}`,
        council.decision.openWith ? `Prvá veta sa opiera o zistenie ${council.decision.openWith}` : "",
        council.decision.mailAngle ? `Preferovaný uhol: ${council.decision.mailAngle}` : "",
        council.decision.objection ? `Najpravdepodobnejšia námietka majiteľa: ${council.decision.objection}${council.decision.defusal ? ` (zmierniť vetou: ${council.decision.defusal})` : ""}` : "",
        council.decision.risks.length ? `Riziká: ${council.decision.risks.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;
  const written = await writeOutreachEmail({ client, lead, segmentName, findings, offer, evidence: pack.items, mockupUrl, guidance, craft: input.craft !== false });
  issues.push(...written.issues);
  const email = written.email;

  return { understanding, nicheNotes, findings, dropped, offer, email, skipReason: null, mockupUrl, craft: written.craft, council, pack, usage: getAiUsage(), issues };
}

export { EmailQualityError };
