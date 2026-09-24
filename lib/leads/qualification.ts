// JEDINÝ zdroj pravdy pre prah kvalifikácie leadu (skóre zastaralosti webu,
// vyššie = horší web = lepší lead). Zámerne bez importov — používa ho serverový
// analyzátor aj klientský zoznam leadov (page.tsx), takže sem nesmie prísť
// žiadny server-only kód (Anthropic SDK, puppeteer…).
//
// Skóre = technické (0-40) + vizuálne (0-60). Vizuálne kritériá AI hodnotí
// samostatne a v praxi sa skóre pohybuje v strednej časti škály. Preto prah
// NIE JE 65 — také skóre nový systém takmer nedosiahne (max. vizuál v dátach 45,
// technické v priemere ~3).
//
// KALIBRÁCIA (24. 9. 2026): 31 reálnych leadov, každý web som posúdil vizuálne
// zo screenshotu a porovnal so skóre (temperature 0, lokálny Chrome):
//   • jasne zastarané (Web 2.0 dlaždice, šablónové slidery, rozbité prekrytia…): 30–43
//   • moderné (tmavé/minimalistické/čisté dizajny):                                 7–24
//   • zastarané na Verceli: ayurfyzio 28, fyzioterapia 29, silvernurse 29, remotion 33
// Ten istý web vie namerať ±6 (výnimočne −14: vyresime 35 na Verceli vs 21
// lokálne — iný PageSpeed a stav slidera), preto prah nesedí tesne pri hranici
// 24/28, ale nižšie: zastaraný web s 28–29 a šumom −6 stále prejde.

/** Skóre ≥ QUALIFY_AT = zastaraný web = vhodný na oslovenie (kampane, dossier). */
export const QUALIFY_AT = 22;

/**
 * Skóre ≥ BORDERLINE_AT (a < QUALIFY_AT) = hraničný web, treba pozrieť ručne.
 * Pod touto hranicou je web jednoznačne v poriadku (v kalibrácii 7–15) a dá sa
 * hromadne skryť; hraničné a vhodné leady sa nikdy neskryjú automaticky.
 */
export const BORDERLINE_AT = 16;

/**
 * Kedy sa naposledy zmenila skórovacia logika (screenshot, prompt, prah).
 * Leady naskenované PRED týmto časom majú skóre zo staršej verzie — "Preanalyzovať
 * staré" preanalyzuje LEN tie. Leady analyzované po tomto čase sa nikdy
 * nepreanalyzujú zbytočne (kliknúť naň druhýkrát je bezpečné, nezmaže hotovú prácu).
 * Pri ďalšej zmene skórovania sem daj čas nasadenia.
 */
export const ANALYSIS_CURRENT_SINCE = "2026-09-24T09:00:00.000Z";

/**
 * Kedy sa nasadil nový generátor mailov (oslovenie z overeného mena, kontrola kvality,
 * jazyková korektúra). Neupravené koncepty, ktoré vznikli PRED týmto časom, sú
 * "staré" — dajú sa hromadne prepísať novým generátorom.
 */
export const EMAIL_PIPELINE_SINCE = "2026-09-24T11:42:00.000Z";

export type ScoreTier = "qualified" | "borderline" | "good" | "unscored";

export function scoreTier(score: number | null | undefined): ScoreTier {
  if (score === null || score === undefined) return "unscored";
  if (score >= QUALIFY_AT) return "qualified";
  if (score >= BORDERLINE_AT) return "borderline";
  return "good";
}
