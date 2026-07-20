import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/leads/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leads/templates — najčastejšie používané prvé. */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const templates = await prisma.emailTemplate.findMany({
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ templates: templates.map(serializeTemplate) });
}

/** POST /api/leads/templates — nová šablóna. */
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

  const name = String(b.name ?? "").trim();
  const body = String(b.body ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!body)
    return NextResponse.json({ error: "missing_body" }, { status: 400 });

  const template = await prisma.emailTemplate.create({
    data: {
      name: name.slice(0, 120),
      subject: String(b.subject ?? "")
        .trim()
        .slice(0, 300),
      body,
      category: String(b.category ?? "")
        .trim()
        .slice(0, 60),
    },
  });
  return NextResponse.json(
    { template: serializeTemplate(template) },
    { status: 201 },
  );
}
