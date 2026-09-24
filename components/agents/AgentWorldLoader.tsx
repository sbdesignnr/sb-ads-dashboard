"use client";

import dynamic from "next/dynamic";

// Scéna závisí od času a veľkosti okna, preto sa vykresľuje len v prehliadači
// (bez SSR) — predíde sa nezhode medzi serverovým a klientskym HTML.
const AgentWorld = dynamic(() => import("./AgentWorld").then((m) => m.AgentWorld), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl border border-border bg-surface-2" />,
});

export function AgentWorldLoader() {
  return <AgentWorld />;
}
