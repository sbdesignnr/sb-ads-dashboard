import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompetitorsView } from "@/components/competitors/CompetitorsView";
import { RegionalMap } from "@/components/competitors/RegionalMap";

export const metadata: Metadata = {
  title: "Konkurencia",
};

export default function CompetitorsPage() {
  return (
    <div className="space-y-6">
      <CompetitorsView />

      {/* Regional purchasing power */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <MapPin className="h-5 w-5 text-muted" />
          <div>
            <CardTitle>Regionálna kúpna sila</CardTitle>
            <p className="text-sm text-muted">
              Odporúčané ceny webov podľa krajov (dáta ŠÚ SR 2024)
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <RegionalMap />
        </CardContent>
      </Card>
    </div>
  );
}
