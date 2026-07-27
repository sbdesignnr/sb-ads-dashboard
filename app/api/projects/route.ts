import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeProject, DEFAULT_CHECKLIST } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const projectInclude = {
  client: { select: { name: true, company: true } },
  checklistItems: { select: { completed: true } },
  questionnaire: { select: { completedAt: true } },
};

/** GET /api/projects — všetky projekty (pre kanban). */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const projects = await prisma.project.findMany({
    include: projectInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects: projects.map(serializeProject) });
}

const TYPES = ["web", "eshop", "marketing", "other"];

/**
 * POST /api/projects — nový projekt. Klient buď existujúci (`clientId`), alebo
 * nový (`client: {company,name,email,phone}`). Automaticky vytvorí 12-krokový
 * checklist a dotazník s unikátnym tokenom.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: {
    clientId?: string;
    client?: {
      company?: string;
      name?: string;
      email?: string;
      phone?: string;
    };
    name?: string;
    type?: string;
    price?: number | string;
    deadline?: string;
    notes?: string;
  } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = String(b.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const type = TYPES.includes(String(b.type)) ? String(b.type) : "web";

  // Klient: existujúci alebo nový.
  let clientId = typeof b.clientId === "string" && b.clientId ? b.clientId : "";
  if (!clientId) {
    const company = String(b.client?.company ?? "").trim();
    if (!company)
      return NextResponse.json({ error: "missing_client" }, { status: 400 });
    const created = await prisma.client.create({
      data: {
        company,
        name: String(b.client?.name ?? "").trim() || company,
        email: String(b.client?.email ?? "").trim(),
        phone: String(b.client?.phone ?? "").trim() || null,
      },
    });
    clientId = created.id;
  } else {
    const exists = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!exists)
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

  const priceNum = b.price != null && b.price !== "" ? Number(b.price) : null;
  const price =
    priceNum != null && Number.isFinite(priceNum) && priceNum >= 0
      ? priceNum
      : null;
  const depositAmount =
    price != null ? Math.round(price * 0.3 * 100) / 100 : null;
  const deadline = b.deadline ? new Date(b.deadline) : null;

  const project = await prisma.project.create({
    data: {
      clientId,
      name,
      type,
      price,
      depositAmount,
      deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
      notes: String(b.notes ?? "").trim() || null,
      // Auto-vytvorenie checklistu (12 krokov) + dotazníka s tokenom.
      checklistItems: {
        create: DEFAULT_CHECKLIST.map((c, i) => ({
          step: c.step,
          title: c.title,
          order: i + 1,
        })),
      },
      questionnaire: { create: {} },
    },
    include: projectInclude,
  });

  return NextResponse.json(
    { project: serializeProject(project) },
    { status: 201 },
  );
}
