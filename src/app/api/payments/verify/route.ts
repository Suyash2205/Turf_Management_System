import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateAndSerializeBooking } from "@/lib/bookings";
import { VerificationStatus } from "@prisma/client";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentId, status } = await request.json();

  if (!paymentId || !["VERIFIED", "REJECTED", "PENDING"].includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      verificationStatus: status as VerificationStatus,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
    },
  });

  const booking = await recalculateAndSerializeBooking(payment.bookingId);

  return NextResponse.json({ payment, booking });
}
