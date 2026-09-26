import type { Metadata } from "next";
import { AgentWorldLoader } from "@/components/agents/AgentWorldLoader";

export const metadata: Metadata = { title: "Agenti" };

export default function AgentiPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">
          Operačné centrum tvojho tímu agentov. Postavy ukazujú reálny stav: kto pracuje, kto čaká na
          tvoje schválenie a kto má voľno. Klikni na agenta a porozprávaj sa s ním.
        </p>
      </div>
      <div className="h-[calc(100dvh-13rem)] min-h-[520px] lg:h-[calc(100dvh-11.5rem)]">
        <AgentWorldLoader />
      </div>
    </div>
  );
}
