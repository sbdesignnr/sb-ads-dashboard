function fold(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// First matching rule wins, so order matters where keywords could overlap:
// specific brands/entities first, risky short tokens (BAR, CLUB) last, and the
// food rules before "Zábava & šport" so a "cafe bar" lands in food.
// `forType` obmedzí pravidlo len na danú stranu (napr. "Biznis výdavok" má
// zmysel len pre platby VON — keď tá istá osoba/firma platí NÁM, pravidlo sa
// preskočí a padne to na bežnú príjmovú logiku nižšie namiesto nesprávnej
// "výdavkovej" kategórie na skutočnom príjme).
const RULES: { category: string; keywords: string[]; forType?: "income" | "expense" }[] = [
  // AI tools + dev infra subscriptions ("ELEVEN" already covers "ELEVENLABS").
  {
    category: "Predplatné",
    keywords: [
      "OPENAI", "ANTHROPIC", "CLAUDE",
      "ELEVENLABS", "ELEVEN",
      "HIGGSFIELD", "KLING", "MYIMAGE", "MIDJOURNEY", "RUNWAY",
      "VERCEL", "SUPABASE", "GITHUB", "NETLIFY", "BREVO", "WEBSUPPORT",
    ],
  },
  // Ad platforms — note GOOGLE resolves here (Google Ads), not to Predplatné.
  { category: "Reklama", keywords: ["GOOGLE", "META", "FACEBOOK"] },
  { category: "Zdravotné poistenie", keywords: ["DOVERA", "ZDRAVOTN", "POISTOV"] },
  { category: "Doprava", keywords: ["SHELL", "OMV", "MOL", "BENZÍN", "NAFTA", "PARKOVN", "BOLT", "UBER", "TAXIK"] },
  { category: "Potraviny", keywords: ["BILLA", "TESCO", "LIDL", "KAUFLAND", "COOP"] },
  { category: "Jedlo & reštaurácie", keywords: ["REŠTAURÁCIA", "PIZZ", "BURGER", "CAFE", "KAVIAREŇ", "BISTRO", "KEBAB"] },
  { category: "Zdravie", keywords: ["LEKÁR", "LEKÁREŇ", "DOKTOR", "NEMOCNICA"] },
  { category: "Oblečenie", keywords: ["ADIDAS", "NIKE", "ZARA", "HM", "MALL", "ALZA"] },
  // Known people → personal transfers; wins over the generic income fallback.
  { category: "Osobný prevod", keywords: ["HUPKA", "FILIP", "SAMUEL", "BIBEN"] },
  { category: "Biznis výdavok", keywords: ["MALASTOV", "LUCIA"], forType: "expense" },
  // Risky short tokens (BAR, CLUB) last so more specific rules match first.
  { category: "Zábava & šport", keywords: ["FUTBAL", "GYM", "FITNESS", "SPORT", "MOONCLUB", "LOUNGE", "BAR", "CLUB"] },
];

export function categorizeTransaction(
  description: string,
  amount: number,
): { category: string; type: "income" | "expense" } {
  const d = fold(description);
  const type: "income" | "expense" = amount >= 0 ? "income" : "expense";
  for (const r of RULES) {
    if (r.forType && r.forType !== type) continue;
    if (r.keywords.some((k) => d.includes(fold(k)))) {
      return { category: r.category, type };
    }
  }
  // Positive amount that looks like an incoming payment → project income.
  // (fold() strips diacritics, so "Prijatá platba" → "PRIJATA PLATBA".)
  const incomeHints = ["PLATBA PRIJATA", "PRIJATA PLATBA", "PLATBA", "PREVOD PRIJATY"];
  if (amount > 0 && incomeHints.some((h) => d.includes(h))) {
    return { category: "Príjem z projektu", type: "income" };
  }
  return { category: amount >= 0 ? "Príjem" : "Ostatné", type: amount >= 0 ? "income" : "expense" };
}
