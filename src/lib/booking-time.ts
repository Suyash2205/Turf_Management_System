/** Parse "HH:mm" (24h) into total minutes from midnight. */
export function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Parse 24h ("19:00") or 12h ("7:00 PM") booking times. */
export function parseBookingTimeToMinutes(
  time: string | null | undefined
): number | null {
  if (!time) return null;

  const as24h = parseTimeToMinutes(time);
  if (as24h != null) return as24h;

  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (hours > 12 || minutes > 59) return null;
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** Format minutes from midnight as "HH:mm". */
export function formatMinutesToTime(totalMinutes: number): string {
  const normalized =
    ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getBookingTimeRange(
  booking: {
    startTime: string | null | undefined;
    endTime?: string | null | undefined;
  },
  defaultDurationMinutes = 60
): { start: number; end: number } | null {
  const start = parseBookingTimeToMinutes(booking.startTime);
  if (start == null) return null;

  let end = parseBookingTimeToMinutes(booking.endTime);
  if (end == null || end <= start) {
    end = start + defaultDurationMinutes;
  }

  return { start, end };
}

export function bookingTimesOverlap(
  a: {
    startTime: string | null | undefined;
    endTime?: string | null | undefined;
  },
  b: {
    startTime: string | null | undefined;
    endTime?: string | null | undefined;
  }
) {
  const rangeA = getBookingTimeRange(a);
  const rangeB = getBookingTimeRange(b);
  if (!rangeA || !rangeB) return false;
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
}

/** Add fractional hours to a booking time string (24h or 12h). */
export function addHoursToTime(time: string, hours: number): string | null {
  const base = parseBookingTimeToMinutes(time);
  if (base == null || !Number.isFinite(hours) || hours <= 0) return null;
  const added = Math.round(hours * 60);
  return formatMinutesToTime(base + added);
}

/** Subtract fractional hours from a booking time string (24h or 12h). */
export function subtractHoursFromTime(time: string, hours: number): string | null {
  const base = parseBookingTimeToMinutes(time);
  if (base == null || !Number.isFinite(hours) || hours <= 0) return null;
  const removed = Math.round(hours * 60);
  return formatMinutesToTime(base - removed);
}
