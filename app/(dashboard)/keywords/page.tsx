"use client";

import { Sparkles, TrendingDown, Ban, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetSimulator } from "@/components/keywords/BudgetSimulator";
import { RealKeywordData } from "@/components/keywords/RealKeywordData";
import { LongTailTab } from "@/components/keywords/LongTailTab";
import { KeywordTable } from "@/components/keywords/KeywordTable";
import { NegativeKeywords } from "@/components/keywords/NegativeKeywords";
import { AIKeywordAdvisor } from "@/components/keywords/AIKeywordAdvisor";
import { MyKeywordList } from "@/components/keywords/MyKeywordList";
import { expensiveKeywords } from "@/lib/mock-data/keywords";

export default function KeywordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Keyword Intelligence</h1>
        <p className="text-sm text-muted">
          Nájdi lacné long-tail kľúčové slová, vyhni sa drahej konkurencii a ochráň rozpočet
          negatívnymi slovami.
        </p>
      </div>

      {/* Section 1 — Budget simulator */}
      <BudgetSimulator />

      {/* Real data from Google Keyword Planner */}
      <RealKeywordData />

      {/* Section 2 — Tabs */}
      <Tabs defaultValue="longtail" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="longtail" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Long-tail odporúčania
          </TabsTrigger>
          <TabsTrigger value="expensive" className="gap-1.5">
            <TrendingDown className="h-4 w-4" />
            Drahé slová (vyhnúť sa)
          </TabsTrigger>
          <TabsTrigger value="negative" className="gap-1.5">
            <Ban className="h-4 w-4" />
            Negative keywords
          </TabsTrigger>
        </TabsList>

        <TabsContent value="longtail">
          <LongTailTab />
        </TabsContent>

        <TabsContent value="expensive">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Týmto kľúčovým slovám sa pri malom rozpočte vyhni
                </p>
                <p className="text-sm text-muted">
                  Vysoká konkurencia a CPC nad 2,5 € rýchlo vyčerpajú rozpočet. Klikni na riadok a
                  zobraz si lacnejšie long-tail alternatívy.
                </p>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6">
                <KeywordTable rows={expensiveKeywords} variant="expensive" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="negative">
          <NegativeKeywords />
        </TabsContent>
      </Tabs>

      {/* Section 3 — AI advisor */}
      <AIKeywordAdvisor />

      {/* Section 4 — My keyword list */}
      <MyKeywordList />
    </div>
  );
}
