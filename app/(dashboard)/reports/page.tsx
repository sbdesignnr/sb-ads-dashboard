"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Loader2, FileSpreadsheet, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { ReportPreview } from "@/components/reports/ReportPreview";
import { buildReport, defaultReportConfig, type ReportConfig } from "@/lib/report";
import { buildReportCsv, downloadCsv, downloadFile } from "@/lib/export";

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report"
  );
}

export default function ReportsPage() {
  const [config, setConfig] = useState<ReportConfig>(() => defaultReportConfig());
  const [pdfLoading, setPdfLoading] = useState(false);

  const report = useMemo(() => buildReport(config), [config]);
  const hasData = config.campaignIds.length > 0 && config.metrics.length > 0;

  const exportCsv = () => {
    if (!hasData) return;
    downloadCsv(`${slugify(config.title)}.csv`, buildReportCsv(report));
  };

  const exportPdf = async () => {
    if (!hasData) return;
    setPdfLoading(true);
    try {
      const { generateReportPdf } = await import("@/components/reports/report-pdf");
      const blob = await generateReportPdf(report);
      downloadFile(`${slugify(config.title)}.pdf`, blob, "application/pdf");
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reporty</h1>
          <p className="text-sm text-muted">
            Vytvor a exportuj prémiový report výkonu kampaní.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={!hasData}>
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="gradient" onClick={exportPdf} disabled={!hasData || pdfLoading}>
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ReportBuilder config={config} onChange={setConfig} />
        </div>

        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-20">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted" />
              <h2 className="text-lg font-semibold text-foreground">Náhľad</h2>
            </div>
            {hasData ? (
              <ReportPreview data={report} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted">
                    Vyber aspoň jednu kampaň a metriku pre zobrazenie náhľadu reportu.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
