import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeContract } from "@/lib/onboarding/store";
import { generateContractHtml } from "@/lib/onboarding/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/contract — vygeneruje (alebo prepíše) návrh zmluvy z
 * údajov projektu a klienta. Vráti zmluvu vrátane tokenu na verejný podpisový link.
 * Už podpísanú zmluvu neprepíše.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!project)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const existing = await prisma.contract.findUnique({
    where: { projectId: id },
  });
  if (existing?.signedAt) {
    return NextResponse.json(
      { error: "already_signed", contract: serializeContract(existing) },
      { status: 409 },
    );
  }

  const content = generateContractHtml(project, project.client);
  const contract = await prisma.contract.upsert({
    where: { projectId: id },
    create: { projectId: id, content, status: "sent" },
    update: { content, status: "sent" },
  });
  return NextResponse.json(
    { contract: serializeContract(contract) },
    { status: 201 },
  );
}
