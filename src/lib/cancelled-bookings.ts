import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import type { ParsedBookingEmail } from "@/lib/email-parser";

const EMAIL_SYNC_ACTOR = "email-sync@turfpay.com";

export type CancelBookingLogContext = {
  emailSubject?: string;
  source?: "email-sync" | "cancelled-history-script";
};

async function logRemovedBookings(
  bookings: Array<{
    id: string;
    externalId: string | null;
    customerName: string;
    bookingDate: Date;
    startTime: string | null;
    endTime: string | null;
  }>,
  context?: CancelBookingLogContext
) {
  for (const booking of bookings) {
    const dateLabel = booking.bookingDate.toISOString().slice(0, 10);
    const timeLabel =
      booking.startTime && booking.endTime
        ? ` ${booking.startTime}–${booking.endTime}`
        : "";

    await logAudit({
      action: "BOOKING_CANCELLED",
      userEmail: EMAIL_SYNC_ACTOR,
      entityType: "booking",
      entityId: booking.externalId ?? booking.id,
      bookingId: booking.id,
      summary: `Removed cancelled booking for ${booking.customerName} on ${dateLabel}${timeLabel}${
        booking.externalId ? ` (${booking.externalId})` : ""
      }`,
      details: {
        source: context?.source ?? "email-sync",
        emailSubject: context?.emailSubject ?? null,
        externalId: booking.externalId,
        customerName: booking.customerName,
        bookingDate: dateLabel,
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    });
  }
}

const bookingSelect = {
  id: true,
  externalId: true,
  customerName: true,
  bookingDate: true,
  startTime: true,
  endTime: true,
} as const;

export async function removeCancelledBookings(
  baseExternalId: string | null,
  cancelledBookings: ParsedBookingEmail[],
  context?: CancelBookingLogContext
) {
  if (!baseExternalId) return 0;

  if (cancelledBookings.length === 0) {
    const toRemove = await prisma.booking.findMany({
      where: {
        OR: [
          { externalId: baseExternalId },
          { externalId: { startsWith: `${baseExternalId}#` } },
        ],
      },
      select: bookingSelect,
    });
    if (toRemove.length === 0) return 0;

    await prisma.booking.deleteMany({
      where: { id: { in: toRemove.map((b) => b.id) } },
    });
    await logRemovedBookings(toRemove, context);
    return toRemove.length;
  }

  let removed = 0;
  for (const booking of cancelledBookings) {
    const base = (booking.externalId || baseExternalId).split("#")[0];
    const dateKey = booking.bookingDate.toISOString().slice(0, 10);

    const toRemove = await prisma.booking.findMany({
      where: {
        OR: [
          { externalId: `${base}#${dateKey}` },
          { externalId: base, bookingDate: booking.bookingDate },
        ],
      },
      select: bookingSelect,
    });
    if (toRemove.length === 0) continue;

    await prisma.booking.deleteMany({
      where: { id: { in: toRemove.map((b) => b.id) } },
    });
    await logRemovedBookings(toRemove, context);
    removed += toRemove.length;
  }

  return removed;
}
