import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { PaymentEntryClient } from "./payment-entry-client";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });

  if (!booking) notFound();

  const serialized = serializeBooking(booking, { pendingProofOnly: true });

  return (
    <div className="mx-auto max-w-2xl">
      <PaymentEntryClient booking={serialized} />
    </div>
  );
}
