import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

export interface CampaignPdfSummary {
  label: string;
  value: string;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#080C14",
    color: "#E2E8F0",
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D45",
  },
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
  brandName: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: "#F1F5F9" },
  brandSub: { fontSize: 8, color: "#94A3B8" },
  date: { marginLeft: "auto", fontSize: 8, color: "#94A3B8" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#F1F5F9", marginBottom: 10 },
  summaryBox: {
    borderWidth: 1,
    borderColor: "#1E2D45",
    borderRadius: 6,
    padding: 8,
    marginBottom: 14,
  },
  summaryRow: { flexDirection: "row", marginBottom: 2 },
  summaryLabel: { width: 120, color: "#94A3B8", fontSize: 8.5 },
  summaryValue: { flex: 1, color: "#E2E8F0", fontSize: 8.5 },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#60A5FA", marginTop: 12, marginBottom: 5 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#F1F5F9", marginTop: 8, marginBottom: 3 },
  para: { fontSize: 10, color: "#CBD5E1", marginBottom: 4 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 10, color: "#3B82F6" },
  bulletText: { flex: 1, fontSize: 9.5, color: "#CBD5E1" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: "#64748B",
    borderTopWidth: 1,
    borderTopColor: "#1E2D45",
    paddingTop: 8,
    textAlign: "center",
  },
});

const cleanInline = (s: string) =>
  s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");

type Block = { type: "h1" | "h3" | "bullet" | "para"; text: string };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^#{1,2}\s+/.test(line)) {
      blocks.push({ type: "h1", text: cleanInline(line.replace(/^#{1,2}\s+/, "")) });
    } else if (/^#{3,}\s+/.test(line)) {
      blocks.push({ type: "h3", text: cleanInline(line.replace(/^#{3,}\s+/, "")) });
    } else if (/^\s*[-*•]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: cleanInline(line.replace(/^\s*[-*•]\s+/, "")) });
    } else if (/^\s*\d+\.\s+/.test(line)) {
      blocks.push({ type: "bullet", text: cleanInline(line.replace(/^\s*\d+\.\s+/, "")) });
    } else {
      blocks.push({ type: "para", text: cleanInline(line) });
    }
  }
  return blocks;
}

function CampaignDocument({
  plan,
  summary,
  title,
  dateLabel,
}: {
  plan: string;
  summary: CampaignPdfSummary[];
  title: string;
  dateLabel: string;
}) {
  const blocks = parse(plan);
  return (
    <Document title={title} author="SB Design">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.logo}>SB</Text>
          <View>
            <Text style={styles.brandName}>SB DESIGN</Text>
            <Text style={styles.brandSub}>Campaign Builder · AI plán kampane</Text>
          </View>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>

        {summary.length > 0 && (
          <View style={styles.summaryBox}>
            {summary.map((s) => (
              <View key={s.label} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{s.label}</Text>
                <Text style={styles.summaryValue}>{s.value}</Text>
              </View>
            ))}
          </View>
        )}

        {blocks.map((b, i) => {
          if (b.type === "h1") return <Text key={i} style={styles.h1}>{b.text}</Text>;
          if (b.type === "h3") return <Text key={i} style={styles.h3}>{b.text}</Text>;
          if (b.type === "bullet")
            return (
              <View key={i} style={styles.bulletRow} wrap={false}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            );
          return <Text key={i} style={styles.para}>{b.text}</Text>;
        })}

        <Text style={styles.footer} fixed>
          Vygenerované nástrojom SB Design — Campaign Builder · AI odporúčania, over si ich pred spustením
        </Text>
      </Page>
    </Document>
  );
}

export async function generateCampaignPdf(
  plan: string,
  summary: CampaignPdfSummary[],
  title: string,
  dateLabel: string,
): Promise<Blob> {
  return pdf(<CampaignDocument plan={plan} summary={summary} title={title} dateLabel={dateLabel} />).toBlob();
}
