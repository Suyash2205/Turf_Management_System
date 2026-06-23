import { prisma } from "@/lib/db";
import type { ParsedBookingEmail } from "@/lib/email-parser";

export async function removeCancelledBookings(
  baseExternalId: string | null,
  cancelledBookings: ParsedBookingEmail[]
) {
  if (!baseExternalId) return 0;

  if (cancelledBookings.length === 0) {
    const removed = await prisma.booking.deleteMany({
      where: {
        OR: [
          { externalId: baseExternalId },
          { externalId: { startsWith: `${baseExternalId}#` } },
        ],
      },
    });
    return removed.count;
  }

  let removed = 0;
  for (const booking of cancelledBookings) {
    const base = (booking.externalId || baseExternalId).split("#")[0];
    const dateKey = booking.bookingDate.toISOString().slice(0, 10);

    const result = await prisma.booking.deleteMany({
      where: {
        OR: [
          { externalId: `${base}#${dateKey}` },
          { externalId: base, bookingDate: booking.bookingDate },
        ],
      },
    });
    removed += result.count;
  }

  return removed;
}
