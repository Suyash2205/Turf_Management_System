import { prisma } from "@/lib/db";
import type { ParsedBookingEmail } from "@/lib/email-parser";
import { bookingTimesOverlap, parseBookingTimeToMinutes } from "@/lib/booking-time";

function normalizeTurf(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildCancelledSlotKey(
  externalId: string,
  bookingDate: Date,
  startTime?: string | null,
  endTime?: string | null,
  turfName?: string | null
): string {
  const base = externalId.split("#")[0];
  const dateKey = bookingDate.toISOString().slice(0, 10);
  const turf = normalizeTurf(turfName);
  return `${base}|${dateKey}|${startTime ?? "*"}|${endTime ?? "*"}|${turf}`;
}

function dayBounds(date: Date) {
  const key = date.toISOString().slice(0, 10);
  const gte = new Date(`${key}T12:00:00.000Z`);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function turfMatches(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return true;
  const na = normalizeTurf(a);
  const nb = normalizeTurf(b);
  return na.includes(nb) || nb.includes(na);
}

export async function recordCancelledSlots(
  slots: Array<{
    externalId?: string | null;
    bookingDate: Date;
    startTime?: string | null;
    endTime?: string | null;
    turfName?: string | null;
    emailMessageId?: string | null;
  }>
) {
  for (const slot of slots) {
    const externalId = slot.externalId?.split("#")[0];
    if (!externalId) continue;

    const slotKey = buildCancelledSlotKey(
      externalId,
      slot.bookingDate,
      slot.startTime,
      slot.endTime,
      slot.turfName
    );

    await prisma.cancelledBookingSlot.upsert({
      where: { slotKey },
      create: {
        slotKey,
        externalId,
        bookingDate: slot.bookingDate,
        startTime: slot.startTime ?? null,
        endTime: slot.endTime ?? null,
        turfName: slot.turfName ?? null,
        emailMessageId: slot.emailMessageId ?? null,
      },
      update: {
        emailMessageId: slot.emailMessageId ?? undefined,
      },
    });
  }
}

export async function isBookingImportCancelled(
  booking: ParsedBookingEmail,
  emailMessageId?: string | null
): Promise<boolean> {
  if (emailMessageId) {
    const byMessage = await prisma.cancelledBookingSlot.findUnique({
      where: { emailMessageId },
    });
    if (byMessage) return true;
  }

  const base = booking.externalId?.split("#")[0];
  if (!base) return false;

  const { gte, lt } = dayBounds(booking.bookingDate);
  const cancelled = await prisma.cancelledBookingSlot.findMany({
    where: {
      externalId: base,
      bookingDate: { gte, lt },
    },
  });
  if (cancelled.length === 0) return false;

  const importStart = parseBookingTimeToMinutes(booking.startTime);
  const importEnd = parseBookingTimeToMinutes(booking.endTime);
  if (importStart == null || importEnd == null) {
    return cancelled.some((slot) => turfMatches(booking.turfName, slot.turfName));
  }

  for (const slot of cancelled) {
    if (!turfMatches(booking.turfName, slot.turfName)) continue;

    if (!slot.startTime || !slot.endTime) return true;

    if (
      !bookingTimesOverlap(
        { startTime: booking.startTime, endTime: booking.endTime },
        { startTime: slot.startTime, endTime: slot.endTime }
      )
    ) {
      continue;
    }

    const cancelStart = parseBookingTimeToMinutes(slot.startTime);
    const cancelEnd = parseBookingTimeToMinutes(slot.endTime);
    if (cancelStart == null || cancelEnd == null) continue;

    if (cancelStart <= importStart && cancelEnd >= importEnd) {
      return true;
    }
  }

  return false;
}
