import { BookingAdjustmentType, type Booking, type BookingAdjustment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addHoursToTime, subtractHoursFromTime } from "@/lib/booking-time";
import { recalculateAndSerializeBooking, toNumber } from "@/lib/bookings";

type AdjustmentRow = Pick<BookingAdjustment, "type" | "amount" | "hoursAdded">;
type BookingRow = Pick<
  Booking,
  "totalAmount" | "slotPrice" | "endTime" | "startTime" | "slotEndTime"
>;

export function getBookingBaseAmount(
  booking: BookingRow,
  adjustments: Pick<AdjustmentRow, "amount">[]
) {
  const slotPrice = booking.slotPrice ? toNumber(booking.slotPrice) : null;
  if (slotPrice != null) return slotPrice;

  const adjustmentsTotal = adjustments.reduce(
    (sum, adj) => sum + toNumber(adj.amount),
    0
  );
  return Math.max(0, toNumber(booking.totalAmount) - adjustmentsTotal);
}

export function computeEndTimeFromHourAdjustments(
  booking: Pick<BookingRow, "slotEndTime" | "endTime" | "startTime">,
  hourAdjustments: Pick<AdjustmentRow, "hoursAdded">[]
) {
  if (hourAdjustments.length === 0) {
    return booking.slotEndTime ?? booking.endTime;
  }

  let base = booking.slotEndTime;
  if (!base) {
    let time = booking.endTime ?? booking.startTime;
    if (!time) return booking.endTime;
    for (let i = hourAdjustments.length - 1; i >= 0; i--) {
      const hours = toNumber(hourAdjustments[i].hoursAdded);
      if (hours > 0) {
        const prev = subtractHoursFromTime(time, hours);
        if (prev) time = prev;
      }
    }
    base = time;
  }

  let end = base;
  for (const adj of hourAdjustments) {
    const hours = toNumber(adj.hoursAdded);
    if (hours > 0) {
      const next = addHoursToTime(end, hours);
      if (next) end = next;
    }
  }
  return end;
}

export async function syncBookingAfterAdjustmentChange(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!booking) return null;

  const baseAmount = getBookingBaseAmount(booking, booking.adjustments);
  const adjustmentsTotal = booking.adjustments.reduce(
    (sum, adj) => sum + toNumber(adj.amount),
    0
  );
  const newTotal = baseAmount + adjustmentsTotal;

  const hourAdjustments = booking.adjustments.filter(
    (adj) => adj.type === BookingAdjustmentType.EXTRA_HOURS
  );
  const newEndTime = computeEndTimeFromHourAdjustments(
    booking,
    hourAdjustments
  );

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      totalAmount: newTotal,
      endTime: newEndTime,
    },
  });

  return recalculateAndSerializeBooking(bookingId);
}

export async function ensureSlotEndTime(
  bookingId: string,
  currentEndTime: string | null
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { slotEndTime: true },
  });
  if (!booking?.slotEndTime && currentEndTime) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { slotEndTime: currentEndTime },
    });
  }
}
