import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Zamietnutie mailu. Ak ide o PRVÝ oslovovací mail (initial) neosloveného leada,
 * zamietne sa aj samotný LEAD — používateľ tým hovorí „túto firmu nechcem".
 * Rejektnutý lead potom zmizne zo zoznamu leadov, negeneruje sa mu nový mail a
 * skener ho pri ďalšom behu preskočí. Zamietnutie followupu (lead je už
 * kontaktovaný) zahodí len ten mail, leada nechá tak.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const email = await prisma.leadEmail.findUnique({
    where: { id },
    select: {
      leadId: true,
      emailType: true,
      lead: { select: { status: true } },
    },
  });
  if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rejectLead =
    email.emailType === "initial" && email.lead.status === "new";

  await prisma.$transaction([
    prisma.leadEmail.update({ where: { id }, data: { status: "rejected" } }),
    ...(rejectLead
      ? [
          prisma.lead.update({
            where: { id: email.leadId },
            data: { status: "rejected" },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, leadRejected: rejectLead });
}
