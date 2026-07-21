import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";

const TZ = "Europe/Bratislava";

function localDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Najbližší výskyt denného času `sendTime` (napr. „08:30") v bratislavskom čase,
 * STRIKTNE po `now`. Keď dnešný čas už prešiel, vráti zajtrajší.
 *   - teraz 07:00, sendTime 08:30 → dnes 08:30
 *   - teraz 08:35, sendTime 08:30 → zajtra 08:30
 */
export function nextSendTime(sendTime: string, now: Date): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec((sendTime ?? "").trim());
  const hh = m ? String(Math.min(23, Number(m[1]))).padStart(2, "0") : "08";
  const mm = m ? String(Math.min(59, Number(m[2]))).padStart(2, "0") : "30";

  const today = fromZonedTime(`${localDay(now)}T${hh}:${mm}:00`, TZ);
  if (today > now) return today;
  // Zajtrajší lokálny deň (posun o 24 h a znovu vezmeme lokálny dátum).
  const tomorrowLocal = localDay(new Date(now.getTime() + 24 * 3_600_000));
  return fromZonedTime(`${tomorrowLocal}T${hh}:${mm}:00`, TZ);
}

/**
 * Kampaň pokrývajúca daný segment (uprednostní segmentovo špecifickú a aktívnu).
 * Kampaň bez segmentu („Všetky segmenty") pokrýva všetko.
 */
async function coveringCampaign(segmentId: string | null) {
  if (segmentId) {
    const seg = await prisma.leadCampaign.findFirst({
      where: { segmentId },
      orderBy: { isActive: "desc" },
    });
    if (seg) return seg;
  }
  return prisma.leadCampaign.findFirst({
    where: { segmentId: null },
    orderBy: { isActive: "desc" },
  });
}

/**
 * Predvolený čas odoslania pre práve schvaľovaný mail: najbližší denný `sendTime`
 * kampane, ktorá pokrýva segment leadu. `null`, keď žiadna kampaň neexistuje
 * (vtedy sa čas nenastaví a mail počká, kým kampaň vznikne).
 */
export async function defaultSendSchedule(
  segmentId: string | null,
  now: Date,
): Promise<Date | null> {
  const campaign = await coveringCampaign(segmentId);
  return campaign ? nextSendTime(campaign.sendTime, now) : null;
}
