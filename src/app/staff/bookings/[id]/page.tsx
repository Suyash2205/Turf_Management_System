import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { bookingHasDoubleBooking } from "@/lib/double-booking";
import { PaymentEntryClient } from "./payment-entry-client";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      adjustments: {
        orderBy: { createdAt: "desc" },
        include: { addedBy: { select: { name: true } } },
      },
    },
  });

  if (!booking) notFound();

  const serialized = serializeBooking(booking, { pendingProofOnly: true });
  const isDoubleBooking = await bookingHasDoubleBooking(id);

  return (
    <div className="mx-auto max-w-2xl">
      <PaymentEntryClient booking={{ ...serialized, isDoubleBooking }} />
    </div>
  );
}
