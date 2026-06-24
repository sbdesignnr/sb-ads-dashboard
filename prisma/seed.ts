import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
// Relative import (tsx does not resolve "@/" path aliases). constants.ts is
// dependency-free so it loads cleanly here.
import { COMPETITORS, REGIONS } from "../lib/competitors/constants";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.DEMO_EMAIL ?? "admin@sbdesign.sk").toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? "sbdesign2025";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: "SB Design Admin", role: "admin" },
    create: { email, passwordHash, name: "SB Design Admin", role: "admin" },
  });

  console.log(`✓ Seeded admin user: ${email}`);

  // --- Competitors ---
  const competitorCount = await prisma.competitor.count();
  if (competitorCount === 0) {
    await prisma.competitor.createMany({
      data: COMPETITORS.map((c) => ({ name: c.name, url: c.url })),
    });
    console.log(`✓ Seeded ${COMPETITORS.length} competitors`);
  } else {
    console.log(`• Competitors already present (${competitorCount}) — skipping`);
  }

  // --- Regional purchasing-power data ---
  const regionCount = await prisma.regionalData.count();
  if (regionCount === 0) {
    for (const r of REGIONS) {
      await prisma.regionalData.create({
        data: {
          region: r.name,
          avgSalary: r.avgSalary,
          gdpPerCapita: r.gdpPerCapita,
          businessDensity: r.businessDensity,
          recommendedPricing: { min: r.priceMin, max: r.priceMax },
        },
      });
    }
    console.log(`✓ Seeded ${REGIONS.length} regions`);
  } else {
    console.log(`• Regions already present (${regionCount}) — skipping`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
