import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateAndSerializeBooking, toNumber } from "@/lib/bookings";
import { VerificationStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit-log";

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
    include: {
      booking: { select: { customerName: true } },
      recordedBy: { select: { email: true } },
    },
  });

  const booking = await recalculateAndSerializeBooking(payment.bookingId);

  const action =
    status === "VERIFIED"
      ? "PAYMENT_VERIFIED"
      : status === "REJECTED"
        ? "PAYMENT_REJECTED"
        : "PAYMENT_UPDATED";

  await logAudit({
    action,
    session,
    summary: `${session.user.email} ${status === "VERIFIED" ? "verified" : status === "REJECTED" ? "rejected" : "reset"} ₹${toNumber(payment.amount).toLocaleString("en-IN")} payment for ${payment.booking.customerName}`,
    entityType: "payment",
    entityId: payment.id,
    bookingId: payment.bookingId,
    details: {
      amount: toNumber(payment.amount),
      method: payment.method,
      status,
      customerName: payment.booking.customerName,
      recordedBy: payment.recordedBy?.email,
    },
    request,
  });

  return NextResponse.json({ payment, booking });
}
