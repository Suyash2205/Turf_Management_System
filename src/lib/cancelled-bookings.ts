import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import type { ParsedBookingEmail } from "@/lib/email-parser";
import {
  formatMinutesToTime,
  parseBookingTimeToMinutes,
  bookingTimesOverlap,
} from "@/lib/booking-time";
import { Prisma } from "@prisma/client";

const EMAIL_SYNC_ACTOR = "email-sync@turfpay.com";

export type CancelBookingLogContext = {
  emailSubject?: string;
  source?: "email-sync" | "cancelled-history-script";
};

const bookingSelect = {
  id: true,
  externalId: true,
  customerName: true,
  bookingDate: true,
  startTime: true,
  endTime: true,
  totalAmount: true,
  slotPrice: true,
  turfName: true,
} as const;

type BookingRow = {
  id: string;
  externalId: string | null;
  customerName: string;
  bookingDate: Date;
  startTime: string | null;
  endTime: string | null;
  totalAmount: Prisma.Decimal;
  slotPrice: Prisma.Decimal | null;
  turfName: string | null;
};

function turfMatches(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return true;
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return na.includes(nb) || nb.includes(na);
}

function dayBounds(date: Date) {
  const key = date.toISOString().slice(0, 10);
  const gte = new Date(`${key}T12:00:00.000Z`);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function toNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function scaleAmount(
  amount: Prisma.Decimal,
  ratio: number
): Prisma.Decimal {
  const scaled = Math.round(toNumber(amount) * ratio * 100) / 100;
  return new Prisma.Decimal(Math.max(0, scaled));
}

type SlotChange =
  | { action: "delete" }
  | {
      action: "update";
      startTime: string;
      endTime: string;
      ratio: number;
    };

function applySlotCancellation(
  booking: Pick<BookingRow, "startTime" | "endTime">,
  cancelStart?: string,
  cancelEnd?: string
): SlotChange | null {
  const bookStart = parseBookingTimeToMinutes(booking.startTime);
  const bookEnd = parseBookingTimeToMinutes(booking.endTime);
  const cStart = parseBookingTimeToMinutes(cancelStart);
  const cEnd = parseBookingTimeToMinutes(cancelEnd);
  if (
    bookStart == null ||
    bookEnd == null ||
    cStart == null ||
    cEnd == null
  ) {
    return null;
  }

  if (cStart <= bookStart && cEnd >= bookEnd) {
    return { action: "delete" };
  }

  if (cStart >= bookStart && cStart < bookEnd && cEnd >= bookEnd) {
    const newEnd = formatMinutesToTime(cStart);
    const oldDur = bookEnd - bookStart;
    const newDur = cStart - bookStart;
    if (newDur <= 0) return { action: "delete" };
    return {
      action: "update",
      startTime: booking.startTime!,
      endTime: newEnd,
      ratio: newDur / oldDur,
    };
  }

  if (cStart <= bookStart && cEnd > bookStart && cEnd <= bookEnd) {
    const newStart = formatMinutesToTime(cEnd);
    const oldDur = bookEnd - bookStart;
    const newDur = bookEnd - cEnd;
    if (newDur <= 0) return { action: "delete" };
    return {
      action: "update",
      startTime: newStart,
      endTime: booking.endTime!,
      ratio: newDur / oldDur,
    };
  }

  return null;
}

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

async function logUpdatedBooking(
  booking: BookingRow,
  update: { startTime: string; endTime: string },
  context?: CancelBookingLogContext
) {
  const dateLabel = booking.bookingDate.toISOString().slice(0, 10);
  await logAudit({
    action: "BOOKING_CANCELLED",
    userEmail: EMAIL_SYNC_ACTOR,
    entityType: "booking",
    entityId: booking.externalId ?? booking.id,
    bookingId: booking.id,
    summary: `Shortened booking for ${booking.customerName} on ${dateLabel} to ${update.startTime}–${update.endTime}${
      booking.externalId ? ` (${booking.externalId})` : ""
    }`,
    details: {
      source: context?.source ?? "email-sync",
      emailSubject: context?.emailSubject ?? null,
      externalId: booking.externalId,
      previousStartTime: booking.startTime,
      previousEndTime: booking.endTime,
      startTime: update.startTime,
      endTime: update.endTime,
    },
  });
}

async function findBookingsForChange(
  baseExternalId: string | null,
  slot: ParsedBookingEmail
): Promise<BookingRow[]> {
  const base = (slot.externalId || baseExternalId || "").split("#")[0];
  const { gte, lt } = dayBounds(slot.bookingDate);

  if (base) {
    const direct = await prisma.booking.findMany({
      where: {
        OR: [
          { externalId: `${base}#${gte.toISOString().slice(0, 10)}` },
          { externalId: base, bookingDate: { gte, lt } },
        ],
      },
      select: bookingSelect,
    });
    if (direct.length > 0) return direct;
  }

  if (!slot.customerName || !slot.startTime || !slot.endTime) return [];

  const candidates = await prisma.booking.findMany({
    where: {
      bookingDate: { gte, lt },
      customerName: { equals: slot.customerName, mode: "insensitive" },
    },
    select: bookingSelect,
  });

  return candidates.filter(
    (booking) =>
      turfMatches(booking.turfName, slot.turfName) &&
      bookingTimesOverlap(booking, {
        startTime: slot.startTime,
        endTime: slot.endTime,
      })
  );
}

async function findBookingsByExternalId(
  baseExternalId: string,
  bookingDate: Date
): Promise<BookingRow[]> {
  const base = baseExternalId.split("#")[0];
  const { gte, lt } = dayBounds(bookingDate);
  return prisma.booking.findMany({
    where: {
      OR: [
        { externalId: `${base}#${gte.toISOString().slice(0, 10)}` },
        { externalId: base, bookingDate: { gte, lt } },
      ],
    },
    select: bookingSelect,
  });
}

export async function applyKhelomoreBookingChanges(
  baseExternalId: string | null,
  modification: {
    cancelled: ParsedBookingEmail[];
    active: ParsedBookingEmail[];
  },
  context?: CancelBookingLogContext
): Promise<{ removed: number; updated: number }> {
  if (!baseExternalId) return { removed: 0, updated: 0 };

  let removed = 0;
  let updated = 0;
  const touchedIds = new Set<string>();

  if (modification.cancelled.length === 0) {
    const toRemove = await prisma.booking.findMany({
      where: {
        OR: [
          { externalId: baseExternalId },
          { externalId: { startsWith: `${baseExternalId}#` } },
        ],
      },
      select: bookingSelect,
    });
    if (toRemove.length > 0) {
      await prisma.booking.deleteMany({
        where: { id: { in: toRemove.map((b) => b.id) } },
      });
      await logRemovedBookings(toRemove, context);
      removed += toRemove.length;
    }
    return { removed, updated };
  }

  for (const slot of modification.cancelled) {
    const matches = await findBookingsForChange(baseExternalId, slot);
    for (const booking of matches) {
      if (touchedIds.has(booking.id)) continue;

      const change = applySlotCancellation(
        booking,
        slot.startTime,
        slot.endTime
      );
      if (!change) continue;

      touchedIds.add(booking.id);

      if (change.action === "delete") {
        await prisma.booking.delete({ where: { id: booking.id } });
        await logRemovedBookings([booking], context);
        removed++;
        continue;
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: change.startTime,
          endTime: change.endTime,
          totalAmount: scaleAmount(booking.totalAmount, change.ratio),
          slotPrice: booking.slotPrice
            ? scaleAmount(booking.slotPrice, change.ratio)
            : undefined,
        },
      });
      await logUpdatedBooking(
        booking,
        { startTime: change.startTime, endTime: change.endTime },
        context
      );
      updated++;
    }
  }

  for (const active of modification.active) {
    const base = (active.externalId || baseExternalId).split("#")[0];
    if (!base || !active.startTime || !active.endTime) continue;

    const matches = await findBookingsByExternalId(base, active.bookingDate);
    for (const booking of matches) {
      if (touchedIds.has(booking.id)) continue;
      if (
        booking.startTime === active.startTime &&
        booking.endTime === active.endTime
      ) {
        continue;
      }

      touchedIds.add(booking.id);
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: active.startTime,
          endTime: active.endTime,
          totalAmount: active.totalAmount,
          slotPrice: active.slotPrice,
        },
      });
      await logUpdatedBooking(
        booking,
        { startTime: active.startTime, endTime: active.endTime },
        context
      );
      updated++;
    }
  }

  return { removed, updated };
}

/** @deprecated Use applyKhelomoreBookingChanges */
export async function removeCancelledBookings(
  baseExternalId: string | null,
  cancelledBookings: ParsedBookingEmail[],
  context?: CancelBookingLogContext
) {
  const result = await applyKhelomoreBookingChanges(
    baseExternalId,
    { cancelled: cancelledBookings, active: [] },
    context
  );
  return result.removed + result.updated;
}
