import { saltEdgeRequest } from "./client";
import { getOrCreateSaltEdgeCustomer } from "./customer";

interface ConnectSessionResponse {
  data: { connect_url: string; expires_at: string; customer_id: string };
}

/**
 * Vytvorí jednorazový odkaz na Salt Edge widget, kde si užívateľ vyberie banku
 * (SK) a prihlási sa. Provider zámerne nie je naviazaný natvrdo na kód (SLSP) —
 * nepoznáme ho s istotou a zlý kód by rovno zhodil request s 404; necháme
 * widget ukázať výber bánk zúžený na Slovensko.
 */
export async function createConnectUrl(returnTo: string, fromDate: string): Promise<string> {
  const customerId = await getOrCreateSaltEdgeCustomer();

  const res = await saltEdgeRequest<ConnectSessionResponse>("/connections/connect", {
    method: "POST",
    body: {
      data: {
        customer_id: customerId,
        consent: {
          scopes: ["accounts", "transactions"],
          from_date: fromDate,
        },
        attempt: {
          fetch_scopes: ["accounts", "balance", "transactions"],
          return_to: returnTo,
        },
        widget: {
          allowed_countries: ["SK"],
          popular_providers_country: "SK",
        },
      },
    },
  });

  return res.data.connect_url;
}
