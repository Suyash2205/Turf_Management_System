import { startOfDay, endOfDay } from "date-fns";
import { bookingTimesOverlap } from "@/lib/booking-time";
import { prisma } from "@/lib/db";

export type BookingSlotFields = {
  id: string;
  bookingDate: Date;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  turfName?: string | null;
};

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function sameBookingContext(
  a: Pick<
    BookingSlotFields,
    "bookingDate" | "venueName" | "turfName" | "startTime"
  >,
  b: Pick<
    BookingSlotFields,
    "bookingDate" | "venueName" | "turfName" | "startTime"
  >
) {
  if (formatDateKey(a.bookingDate) !== formatDateKey(b.bookingDate)) {
    return false;
  }

  const venue = normalizeText(a.venueName);
  const turf = normalizeText(a.turfName);
  if (!venue || !turf || !a.startTime?.trim() || !b.startTime?.trim()) {
    return false;
  }

  return venue === normalizeText(b.venueName) && turf === normalizeText(b.turfName);
}

export function bookingsConflict(
  a: BookingSlotFields,
  b: BookingSlotFields
) {
  if (a.id === b.id) return false;
  if (!sameBookingContext(a, b)) return false;
  return bookingTimesOverlap(a, b);
}

export function markDoubleBookingFlags<T extends BookingSlotFields>(
  bookings: T[]
): Map<string, boolean> {
  const flags = new Map<string, boolean>();

  for (const booking of bookings) {
    let isDouble = false;

    for (const other of bookings) {
      if (bookingsConflict(booking, other)) {
        isDouble = true;
        break;
      }
    }

    flags.set(booking.id, isDouble);
  }

  return flags;
}

export async function bookingHasDoubleBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      venueName: true,
      turfName: true,
    },
  });
  if (!booking) return false;

  if (!booking.turfName?.trim() || !booking.startTime?.trim()) {
    return false;
  }

  const sameDay = await prisma.booking.findMany({
    where: {
      id: { not: bookingId },
      bookingDate: {
        gte: startOfDay(booking.bookingDate),
        lte: endOfDay(booking.bookingDate),
      },
      venueName: booking.venueName,
      turfName: booking.turfName,
    },
    select: {
      id: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      venueName: true,
      turfName: true,
    },
  });

  return sameDay.some((other) => bookingsConflict(booking, other));
}
