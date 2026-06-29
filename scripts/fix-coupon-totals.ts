import "dotenv/config";
import { prisma } from "../src/lib/db";
import { recalculateBookingStatus } from "../src/lib/bookings";

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

type BookingRow = {
  id: string;
  customerName: string;
  externalId: string | null;
  totalAmount: unknown;
  slotPrice: unknown;
  couponAmount: unknown;
};

function expectedSingleDayTotal(booking: BookingRow): number | null {
  const coupon = toNumber(booking.couponAmount);
  const slot = toNumber(booking.slotPrice);
  if (coupon <= 0) return null;
  const referenceSlot = slot > 0 ? slot : toNumber(booking.totalAmount);
  if (referenceSlot <= 0) return null;
  return Math.max(0, referenceSlot - coupon);
}

function expectedMultiDayTotal(
  booking: BookingRow,
  group: BookingRow[],
  coupon: number
): number | null {
  const slot = toNumber(booking.slotPrice);
  if (slot <= 0 || coupon <= 0) return null;
  const allSlotTotal = group.reduce(
    (sum, row) => sum + toNumber(row.slotPrice),
    0
  );
  if (allSlotTotal <= 0) return null;
  const couponShare = Math.round((coupon * slot) / allSlotTotal);
  return Math.max(0, slot - couponShare);
}

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { couponAmount: { gt: 0 } },
    select: {
      id: true,
      customerName: true,
      externalId: true,
      totalAmount: true,
      slotPrice: true,
      couponAmount: true,
    },
  });

  const multiDayGroups = new Map<string, BookingRow[]>();
  for (const booking of bookings) {
    if (!booking.externalId?.includes("#")) continue;
    const baseId = booking.externalId.split("#")[0]!;
    const group = multiDayGroups.get(baseId) ?? [];
    group.push(booking);
    multiDayGroups.set(baseId, group);
  }

  let fixed = 0;
  let alreadyCorrect = 0;

  for (const booking of bookings) {
    const total = toNumber(booking.totalAmount);
    let expected: number | null = null;

    if (booking.externalId?.includes("#")) {
      const baseId = booking.externalId.split("#")[0]!;
      const group = multiDayGroups.get(baseId);
      if (group) {
        expected = expectedMultiDayTotal(
          booking,
          group,
          toNumber(booking.couponAmount)
        );
      }
    } else {
      expected = expectedSingleDayTotal(booking);
    }

    if (expected == null) continue;
    if (Math.abs(total - expected) < 0.01) {
      alreadyCorrect++;
      continue;
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { totalAmount: expected },
    });
    await recalculateBookingStatus(booking.id);
    fixed++;
    console.log(
      `${booking.customerName} (${booking.externalId ?? booking.id}): ${total} -> ${expected}`
    );
  }

  console.log(
    `\nCoupon totals: ${alreadyCorrect} already correct, ${fixed} fixed, ${bookings.length} total with coupons`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
