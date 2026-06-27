import {
  formatMinutesToTime,
  parseBookingTimeToMinutes,
} from "@/lib/booking-time";
import { isToday, parseISO } from "date-fns";

/** 30-minute slots from 06:00 through 23:30 (24-hour labels, same as Khelomore). */
export function buildBookingTimeSlots(
  startMinutes = 6 * 60,
  endMinutes = 23 * 60 + 30,
  stepMinutes = 30
) {
  const slots: string[] = [];
  for (let m = startMinutes; m <= endMinutes; m += stepMinutes) {
    slots.push(formatMinutesToTime(m));
  }
  return slots;
}

export const BOOKING_TIME_SLOTS = buildBookingTimeSlots();

function roundDownTo30Minutes(date: Date) {
  const total = date.getHours() * 60 + date.getMinutes();
  return Math.floor(total / 30) * 30;
}

/** Put the current 30-min slot first for today; all times remain selectable. */
function rotateSlotsFromMinutes(slots: string[], fromMinutes: number) {
  const idx = slots.findIndex(
    (slot) => parseBookingTimeToMinutes(slot) === fromMinutes
  );
  if (idx <= 0) return slots;
  return [...slots.slice(idx), ...slots.slice(0, idx)];
}

/** Start-time list: current slot first when booking is today, otherwise chronological. */
export function getStartTimeOptions(
  bookingDate: string,
  allSlots = BOOKING_TIME_SLOTS
) {
  if (!bookingDate) return allSlots;

  const date = parseISO(`${bookingDate}T12:00:00`);
  if (!isToday(date)) return allSlots;

  return rotateSlotsFromMinutes(allSlots, roundDownTo30Minutes(new Date()));
}

export function isEndTimeAfterStart(startTime: string, endTime: string) {
  const start = parseBookingTimeToMinutes(startTime);
  const end = parseBookingTimeToMinutes(endTime);
  if (start == null || end == null) return true;
  return end > start;
}

export function getEndTimeOptions(startTime: string, slots = BOOKING_TIME_SLOTS) {
  if (!startTime) return slots;
  const start = parseBookingTimeToMinutes(startTime);
  if (start == null) return slots;
  return slots.filter((slot) => {
    const end = parseBookingTimeToMinutes(slot);
    return end != null && end > start;
  });
}
