import { parseTimeToMinutes } from "@/lib/booking-time";
import { isToday, parseISO } from "date-fns";

function formatMinutes12h(totalMinutes: number) {
  const normalized =
    ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  let hour12 = hours24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** 30-minute slots from 6:00 AM through 11:30 PM (12-hour labels). */
export function buildBookingTimeSlots(
  startMinutes = 6 * 60,
  endMinutes = 23 * 60 + 30,
  stepMinutes = 30
) {
  const slots: string[] = [];
  for (let m = startMinutes; m <= endMinutes; m += stepMinutes) {
    slots.push(formatMinutes12h(m));
  }
  return slots;
}

export const BOOKING_TIME_SLOTS = buildBookingTimeSlots();

function roundDownTo30Minutes(date: Date) {
  const total = date.getHours() * 60 + date.getMinutes();
  return Math.floor(total / 30) * 30;
}

/** Start-time list: from current 30-min slot when booking is today, else full day. */
export function getStartTimeOptions(
  bookingDate: string,
  allSlots = BOOKING_TIME_SLOTS
) {
  if (!bookingDate) return allSlots;

  const date = parseISO(`${bookingDate}T12:00:00`);
  if (!isToday(date)) return allSlots;

  const fromMinutes = roundDownTo30Minutes(new Date());
  const filtered = allSlots.filter((slot) => {
    const minutes = parse12hTime(slot);
    return minutes != null && minutes >= fromMinutes;
  });

  return filtered.length > 0 ? filtered : allSlots;
}

function parse12hTime(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return parseTimeToMinutes(time);

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (hours > 12 || minutes > 59) return null;
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function isEndTimeAfterStart(startTime: string, endTime: string) {
  const start = parse12hTime(startTime);
  const end = parse12hTime(endTime);
  if (start == null || end == null) return true;
  return end > start;
}

export function getEndTimeOptions(startTime: string, slots = BOOKING_TIME_SLOTS) {
  if (!startTime) return slots;
  const start = parse12hTime(startTime);
  if (start == null) return slots;
  return slots.filter((slot) => {
    const end = parse12hTime(slot);
    return end != null && end > start;
  });
}
