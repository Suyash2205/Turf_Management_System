/** Parse "HH:mm" (24h) into total minutes from midnight. */
export function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
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

/** Add fractional hours to a "HH:mm" time string. */
export function addHoursToTime(time: string, hours: number): string | null {
  const base = parseTimeToMinutes(time);
  if (base == null || !Number.isFinite(hours) || hours <= 0) return null;
  const added = Math.round(hours * 60);
  return formatMinutesToTime(base + added);
}
