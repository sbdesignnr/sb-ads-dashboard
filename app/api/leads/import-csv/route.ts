import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { krajForCity } from "@/lib/leads/regions-map";
import {
  parseDelimited,
  mapRow,
  resolveSegmentNames,
  OTHER_SEGMENT_NAME,
} from "@/lib/leads/csv-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INSERT_BATCH = 50;

/** POST /api/leads/import-csv — nahrá CSV/TSV export z TrustedLeads a založí leady. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Prijmeme buď multipart (súbor) alebo raw text.
  let text = "";
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file && typeof file !== "string") text = await file.text();
    } else {
      text = await req.text();
    }
  } catch {
    return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  }
  if (!text.trim())
    return NextResponse.json({ error: "empty_file" }, { status: 400 });

  const rows = parseDelimited(text);
  if (rows.length < 2)
    return NextResponse.json({ error: "no_rows" }, { status: 400 });

  const header = rows[0].map((h) => h.trim());

  // 1) Namapuj riadky; „skipped" = chýba názov firmy alebo web (a/b zo zadania).
  let skipped = 0;
  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const lead = mapRow(header, rows[i]);
    if (lead) parsed.push(lead);
    else skipped++;
  }

  // 2) Segmenty — načítaj raz, dopĺňaj cache pri vytváraní nových.
  const segs = await prisma.leadSegment.findMany({
    select: { id: true, name: true },
  });
  const byName = new Map(segs.map((s) => [s.name.toLowerCase(), s]));

  async function segmentIdFor(industry: string): Promise<string> {
    const names = resolveSegmentNames(industry);
    // presná zhoda názvu (case-insensitive)
    for (const n of names) {
      const hit = byName.get(n.toLowerCase());
      if (hit) return hit.id;
    }
    // voľná zhoda: existujúci segment obsahuje „bázu" kandidáta (bez „ SK+CZ")
    for (const n of names) {
      const base = n
        .toLowerCase()
        .replace(/\s*sk\+cz\s*$/, "")
        .trim();
      if (base.length > 3) {
        for (const s of byName.values())
          if (s.name.toLowerCase().includes(base)) return s.id;
      }
    }
    // nič — vytvor kanonický názov
    const created = await prisma.leadSegment.create({
      data: {
        name: names[0],
        color: names[0] === OTHER_SEGMENT_NAME ? "#64748b" : "#3b82f6",
      },
      select: { id: true, name: true },
    });
    byName.set(created.name.toLowerCase(), created);
    return created.id;
  }

  // 3) Dedup voči DB (web + email) aj v rámci súboru.
  const existing = await prisma.lead.findMany({
    select: { websiteUrl: true, companyEmail: true },
  });
  const existingUrls = new Set(
    existing.map((e) => e.websiteUrl?.toLowerCase()).filter(Boolean),
  );
  const existingEmails = new Set(
    existing.map((e) => e.companyEmail?.toLowerCase()).filter(Boolean),
  );
  const seenUrl = new Set<string>();
  const seenEmail = new Set<string>();

  let duplicates = 0;
  const data: Prisma.LeadCreateManyInput[] = [];
  for (const l of parsed) {
    const urlKey = l.websiteUrl.toLowerCase();
    const emailKey = l.companyEmail?.toLowerCase();
    const isDup =
      existingUrls.has(urlKey) ||
      seenUrl.has(urlKey) ||
      (emailKey
        ? existingEmails.has(emailKey) || seenEmail.has(emailKey)
        : false);
    if (isDup) {
      duplicates++;
      continue;
    }
    seenUrl.add(urlKey);
    if (emailKey) seenEmail.add(emailKey);

    const segmentId = await segmentIdFor(l.industry);
    data.push({
      segmentId,
      companyName: l.companyName,
      companyEmail: l.companyEmail,
      companyPhone: l.companyPhone,
      websiteUrl: l.websiteUrl,
      ownerName: l.ownerName,
      ownerPosition: l.ownerPosition,
      companyCity: l.companyCity,
      region: krajForCity(l.companyCity) ?? l.stateRaw,
      country: l.country,
      source: "trusted-leads",
      status: "new",
    });
  }

  // 4) Vlož po dávkach 50; skipDuplicates chytí prípadnú súbežnú kolíziu webu.
  let imported = 0;
  for (let i = 0; i < data.length; i += INSERT_BATCH) {
    const chunk = data.slice(i, i + INSERT_BATCH);
    const res = await prisma.lead.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    imported += res.count;
  }
  // Ak skipDuplicates niečo zahodil, sú to tiež duplikáty.
  duplicates += data.length - imported;

  return NextResponse.json({ imported, skipped, duplicates });
}
