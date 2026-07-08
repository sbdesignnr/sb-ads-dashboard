// Seed the 18 predefined SK+CZ lead segments (Phase 4).
// ADDITIVE and idempotent: upserts by name (creates if missing, refreshes
// keywords/style/color if it exists). It does NOT delete existing segments —
// that would orphan their leads (segmentId → null). Delete unwanted ones in the
// /leads/settings UI if needed.
//
// Run: npx tsx scripts/seed-segments.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#64748b",
];

interface SeedSegment {
  name: string;
  keywords: string[];
  communicationStyle: string;
}

const SEGMENTS: SeedSegment[] = [
  { name: "Stavebné firmy SK+CZ", keywords: ["stavebná firma", "stavební firma", "stavebníctvo"], communicationStyle: "Vecný, priamy. Dôraz na viac dopytov a Google viditeľnosť. Nespomínaj branding." },
  { name: "Realitné kancelárie SK+CZ", keywords: ["realitná kancelária", "realitní kancelář", "reality"], communicationStyle: "Profesionálny. Dôraz na prezentáciu ponúk a dôveru klienta." },
  { name: "Advokáti SK+CZ", keywords: ["advokátska kancelária", "advokátní kancelář", "advokát"], communicationStyle: "Formálny, vecný. Dôveryhodnosť a prvý dojem klienta. Nespomínaj online prítomnosť." },
  { name: "Účtovníci SK+CZ", keywords: ["účtovnícka firma", "účetní firma", "účtovníctvo"], communicationStyle: "Formálny, vecný. Spoľahlivosť a dôvera." },
  { name: "Fyzioterapeuti SK+CZ", keywords: ["fyzioterapia", "fyzioterapeut", "rehabilitácia"], communicationStyle: "Empatický. Dôveryhodnosť a prvý dojem pacienta. Nespomínaj moderný dizajn." },
  { name: "Psychológovia SK+CZ", keywords: ["psychológ", "psycholog", "psychologická poradňa"], communicationStyle: "Citlivý, dôverný tón. Dôveryhodnosť a prvý dojem pacienta." },
  { name: "Architekti SK+CZ", keywords: ["architektonické štúdio", "architektonický ateliér", "architekt"], communicationStyle: "Estetický. Web má reprezentovať kvalitu portfólia. Nespomínaj chýbajúci formulár." },
  { name: "Reštaurácie SK+CZ", keywords: ["reštaurácia", "restaurace"], communicationStyle: "Neformálny. Dôraz na rezervácie online a Google Maps hodnotenia. Nespomínaj web dizajn." },
  { name: "Hotelierstvo SK+CZ", keywords: ["hotel", "penzión", "penzion"], communicationStyle: "Profesionálny. Rezervácie online a prvý dojem hosťa." },
  { name: "Autoservisy SK+CZ", keywords: ["autoservis", "auto servis", "pneuservis"], communicationStyle: "Vecný, priamy. Viac zákaziek cez Google viditeľnosť." },
  { name: "Kozmetické salóny SK+CZ", keywords: ["kozmetický salón", "kosmetický salon", "kozmetika"], communicationStyle: "Priateľský. Online objednávky a prvý dojem." },
  { name: "Fitness štúdiá SK+CZ", keywords: ["fitness", "fitness štúdio", "posilňovňa"], communicationStyle: "Energický, neformálny. Viac klientov cez Google." },
  { name: "Stomatológovia SK+CZ", keywords: ["zubná ambulancia", "zubní ordinace", "stomatológ"], communicationStyle: "Dôveryhodný. Prvý dojem pacienta a dôvera." },
  { name: "Veterinári SK+CZ", keywords: ["veterinárna klinika", "veterinární klinika", "veterinár"], communicationStyle: "Empatický. Dôvera a prvý dojem majiteľa zvieraťa." },
  { name: "Kvetinárstva SK+CZ", keywords: ["kvetinárstvo", "květinářství"], communicationStyle: "Priateľský. Online objednávky a rozvoz." },
  { name: "Pohrebné služby SK+CZ", keywords: ["pohrebná služba", "pohřební služba"], communicationStyle: "Úctivý, citlivý tón. Dôvera a jednoduchý kontakt." },
  { name: "E-shopy SK+CZ (malé)", keywords: ["e-shop", "eshop", "internetový obchod"], communicationStyle: "Vecný. Dôraz na konverzie a rýchlosť načítania." },
  { name: "Fotografické štúdiá SK+CZ", keywords: ["fotografické štúdio", "fotoateliér", "fotograf"], communicationStyle: "Estetický. Web má reprezentovať portfólio a kvalitu prác." },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    const color = PALETTE[i % PALETTE.length];
    const existing = await prisma.leadSegment.findFirst({ where: { name: s.name } });
    if (existing) {
      await prisma.leadSegment.update({
        where: { id: existing.id },
        data: { keywords: s.keywords, communicationStyle: s.communicationStyle, color },
      });
      updated++;
    } else {
      await prisma.leadSegment.create({
        data: { name: s.name, keywords: s.keywords, communicationStyle: s.communicationStyle, color },
      });
      created++;
    }
    console.log(`${existing ? "↻" : "+"} ${s.name}`);
  }
  const total = await prisma.leadSegment.count();
  console.log(`\nHotovo: ${created} vytvorených, ${updated} aktualizovaných. Segmentov v DB spolu: ${total}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
