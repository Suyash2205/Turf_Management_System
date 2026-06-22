import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { AdminBookingVerifyClient } from "./admin-booking-verify-client";

export default async function AdminBookingVerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
      adjustments: {
        orderBy: { createdAt: "desc" },
        include: { addedBy: { select: { name: true } } },
      },
    },
  });

  if (!booking) notFound();

  const serialized = serializeBooking(booking, { pendingProofOnly: true });

  return (
    <div className="mx-auto max-w-2xl">
      <AdminBookingVerifyClient booking={serialized} />
    </div>
  );
}
