import { prisma } from "@/lib/db";
import {
  BookingPaymentStatus,
  PaymentMethod,
  VerificationStatus,
  type Booking,
  type Payment,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export function toNumber(value: Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return typeof value === "number" ? value : parseFloat(value.toString());
}

export function getPaidAmount(payments: Payment[]) {
  return payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
}

export function getPendingAmount(
  booking: Pick<Booking, "totalAmount">,
  payments: Payment[]
) {
  return Math.max(0, toNumber(booking.totalAmount) - getPaidAmount(payments));
}

export async function recalculateBookingStatus(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: true },
  });
  if (!booking) return;

  const total = toNumber(booking.totalAmount);
  const paid = getPaidAmount(booking.payments);

  let paymentStatus: BookingPaymentStatus;
  if (booking.paidOnKhelomore || paid >= total) {
    paymentStatus = BookingPaymentStatus.COMPLETED;
  } else if (paid > 0) {
    paymentStatus = BookingPaymentStatus.PARTIAL;
  } else {
    paymentStatus = BookingPaymentStatus.PENDING;
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus },
  });
}

export function getDefaultVerificationStatus(method: PaymentMethod) {
  return method === PaymentMethod.CASH
    ? VerificationStatus.PENDING
    : VerificationStatus.PENDING;
}

export type BookingWithPayments = Booking & { payments: Payment[] };

export function serializeBooking(booking: BookingWithPayments) {
  const paid = getPaidAmount(booking.payments);
  const total = toNumber(booking.totalAmount);
  const pendingVerificationCount = booking.payments.filter(
    (p) => p.verificationStatus === VerificationStatus.PENDING
  ).length;
  return {
    ...booking,
    bookingDate: booking.bookingDate.toISOString(),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    totalAmount: total,
    paidAmount: paid,
    pendingAmount: Math.max(0, total - paid),
    pendingVerificationCount,
    payments: booking.payments.map((p) => ({
      ...p,
      amount: toNumber(p.amount),
      extractedAmount: p.extractedAmount ? toNumber(p.extractedAmount) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}
