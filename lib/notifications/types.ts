export type AlertSeverity = "critical" | "high" | "medium" | "info";

/** A potential alert produced by a detector, before the AI expert judges it. */
export interface AlertCandidate {
  key: string; // dedup key
  type: string; // disapproved_ad | account_status | budget_limited | tracking_broken | cpa_anomaly | conversion
  severity: AlertSeverity;
  forceSend: boolean; // urgent & unambiguous → always send (AI only polishes wording)
  campaignId?: string;
  campaignName?: string;
  facts: string; // plain-language data the AI reasons over
}

/** A finalized alert ready to push. */
export interface FinalAlert {
  key: string;
  type: string;
  severity: AlertSeverity;
  campaignId?: string;
  title: string;
  body: string;
}
