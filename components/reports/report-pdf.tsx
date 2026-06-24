import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ReportData } from "@/lib/report";
import { METRICS } from "@/lib/metric-config";
import type { MetricKey } from "@/lib/types";

// PDF-safe number formatting (avoids narrow no-break spaces that break in Helvetica).
function group(n: number, dec = 0): string {
  const fixed = Math.abs(n).toFixed(dec);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = n < 0 ? "-" : "";
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

function formatPdf(key: MetricKey, value: number): string {
  switch (key) {
    case "spend":
    case "revenue":
      return `${group(value, 0)} €`;
    case "cpc":
    case "cpm":
      return `${group(value, 2)} €`;
    case "roas":
      return `${value.toFixed(2)}×`;
    case "ctr":
    case "conversionRate":
      return `${value.toFixed(2)} %`;
    default:
      return group(value, 0);
  }
}

const PLATFORM_LABEL: Record<string, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#080C14",
    color: "#F1F5F9",
    paddingHorizontal: 28,
    paddingVertical: 26,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D45",
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    textAlign: "center",
    paddingTop: 8,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginRight: 9,
  },
  brandName: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  brandSub: { fontSize: 8, color: "#94A3B8" },
  metaRight: { textAlign: "right" },
  metaLabel: { fontSize: 8, color: "#94A3B8" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#94A3B8", marginBottom: 16 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  summaryTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1E2D45",
    borderRadius: 6,
    padding: 8,
  },
  summaryLabel: { fontSize: 7.5, color: "#94A3B8", marginBottom: 3 },
  summaryValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D45",
    paddingBottom: 6,
    marginBottom: 2,
  },
  th: { fontSize: 7.5, color: "#94A3B8", fontFamily: "Helvetica-Bold" },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1E2D45",
  },
  rowAlt: { backgroundColor: "#0F1623" },
  nameCell: { width: "26%", paddingRight: 6 },
  nameText: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  platformText: { fontSize: 7, color: "#94A3B8" },
  metricCell: { flex: 1, textAlign: "right", fontSize: 8.5 },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderTopWidth: 1.5,
    borderTopColor: "#1E2D45",
    marginTop: 2,
  },
  totalText: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 7.5,
    color: "#64748B",
    borderTopWidth: 1,
    borderTopColor: "#1E2D45",
    paddingTop: 8,
  },
});

function ReportDocument({ data }: { data: ReportData }) {
  const cols = data.config.metrics.slice(0, 8);

  return (
    <Document title={data.config.title} author="SB Design">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.logo}>SB</Text>
            <View>
              <Text style={styles.brandName}>SB DESIGN</Text>
              <Text style={styles.brandSub}>Ads Analytics Report</Text>
            </View>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>Vygenerované</Text>
            <Text>{data.generatedAt}</Text>
          </View>
        </View>

        <Text style={styles.title}>{data.config.title}</Text>
        <Text style={styles.subtitle}>
          {data.rangeLabel} · {data.rows.length} kampaní
        </Text>

        <View style={styles.summaryRow}>
          {cols.slice(0, 5).map((key) => (
            <View key={key} style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>{METRICS[key].label}</Text>
              <Text style={styles.summaryValue}>{formatPdf(key, data.account[key])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tableHeader}>
          <View style={styles.nameCell}>
            <Text style={styles.th}>KAMPAŇ</Text>
          </View>
          {cols.map((key) => (
            <Text key={key} style={[styles.metricCell, styles.th]}>
              {METRICS[key].short.toUpperCase()}
            </Text>
          ))}
        </View>

        {data.rows.map((row, i) => (
          <View key={row.campaign.id} style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}>
            <View style={styles.nameCell}>
              <Text style={styles.nameText}>{row.campaign.name}</Text>
              <Text style={styles.platformText}>{PLATFORM_LABEL[row.campaign.platform]}</Text>
            </View>
            {cols.map((key) => (
              <Text key={key} style={styles.metricCell}>
                {formatPdf(key, row.totals[key])}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.totalRow}>
          <View style={styles.nameCell}>
            <Text style={styles.totalText}>SPOLU</Text>
          </View>
          {cols.map((key) => (
            <Text key={key} style={[styles.metricCell, styles.totalText]}>
              {formatPdf(key, data.account[key])}
            </Text>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Vygenerované nástrojom SB Design — Ads Analytics Dashboard · dôverné
        </Text>
      </Page>
    </Document>
  );
}

export async function generateReportPdf(data: ReportData): Promise<Blob> {
  return pdf(<ReportDocument data={data} />).toBlob();
}
