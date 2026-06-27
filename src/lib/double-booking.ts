import { startOfDay, endOfDay } from "date-fns";
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

function normalizeTime(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same calendar date, venue, turf, start time, and end time. */
export function getBookingSlotKey(
  booking: Pick<
    BookingSlotFields,
    "bookingDate" | "startTime" | "endTime" | "venueName" | "turfName"
  >
) {
  const date = formatDateKey(booking.bookingDate);
  const venue = (booking.venueName || "").trim().toLowerCase();
  const turf = (booking.turfName || "").trim().toLowerCase();
  const start = normalizeTime(booking.startTime);
  const end = normalizeTime(booking.endTime || booking.startTime);

  if (!date || !venue || !turf || !start) return null;
  return `${date}|${venue}|${turf}|${start}|${end}`;
}

export function markDoubleBookingFlags<T extends BookingSlotFields>(
  bookings: T[]
): Map<string, boolean> {
  const idsByKey = new Map<string, string[]>();

  for (const booking of bookings) {
    const key = getBookingSlotKey(booking);
    if (!key) continue;
    const ids = idsByKey.get(key) ?? [];
    ids.push(booking.id);
    idsByKey.set(key, ids);
  }

  const flags = new Map<string, boolean>();
  for (const booking of bookings) {
    const key = getBookingSlotKey(booking);
    if (!key) {
      flags.set(booking.id, false);
      continue;
    }
    flags.set(booking.id, (idsByKey.get(key)?.length ?? 0) > 1);
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

  const key = getBookingSlotKey(booking);
  if (!key) return false;

  const sameDay = await prisma.booking.findMany({
    where: {
      bookingDate: {
        gte: startOfDay(booking.bookingDate),
        lte: endOfDay(booking.bookingDate),
      },
      venueName: booking.venueName,
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

  return sameDay.some(
    (other) => other.id !== bookingId && getBookingSlotKey(other) === key
  );
}
