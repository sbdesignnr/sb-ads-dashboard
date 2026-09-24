// Stav konceptu mailu: upravil ho človek? vznikol starým generátorom? Čistý modul
// (bez importov) — používa ho serializácia aj API. Rozlíšenie stojí na tom, že
// updatedAt sa pri ručnej úprave posunie, kým pri (pre)generovaní sa createdAt
// nastaví znova na "teraz" (route regenerate-legacy aj emails/[id]/generate), takže
// vygenerovaný koncept nikdy nevyzerá ako ručne upravený.

import { EMAIL_PIPELINE_SINCE } from "./qualification";

interface Stamped {
  createdAt: Date;
  updatedAt: Date;
}

/** Koncept upravil človek po vzniku (zmena > 10 s od vytvorenia). */
export function isEditedByHand(e: Stamped): boolean {
  return e.updatedAt.getTime() - e.createdAt.getTime() > 10_000;
}

/** Neupravený initial koncept z čias pred novým generátorom. */
export function isLegacyDraft(
  e: Stamped & { emailType: string; status: string },
): boolean {
  return (
    e.status === "draft" &&
    e.emailType === "initial" &&
    !isEditedByHand(e) &&
    e.updatedAt < new Date(EMAIL_PIPELINE_SINCE)
  );
}
