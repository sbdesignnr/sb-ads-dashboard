import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeClient } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/clients — zoznam klientov (na autocomplete pri novom projekte). */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clients = await prisma.client.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { company: "asc" },
  });
  return NextResponse.json({ clients: clients.map(serializeClient) });
}

/** POST /api/clients — nový klient. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const company = String(b.company ?? "").trim();
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim();
  if (!company)
    return NextResponse.json({ error: "missing_company" }, { status: 400 });

  const client = await prisma.client.create({
    data: {
      company,
      name: name || company,
      email,
      phone: String(b.phone ?? "").trim() || null,
      address: String(b.address ?? "").trim() || null,
      ico: String(b.ico ?? "").trim() || null,
      dic: String(b.dic ?? "").trim() || null,
      note: String(b.note ?? "").trim() || null,
    },
    include: { _count: { select: { projects: true } } },
  });
  return NextResponse.json(
    { client: serializeClient(client) },
    { status: 201 },
  );
}
