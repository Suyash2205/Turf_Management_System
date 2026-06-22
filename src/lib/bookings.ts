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

export function getPaidAmount(payments: Pick<Payment, "amount">[]) {
  return payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
}

export function getPendingAmount(
  booking: Pick<Booking, "totalAmount">,
  payments: Pick<Payment, "amount">[]
) {
  return Math.max(0, toNumber(booking.totalAmount) - getPaidAmount(payments));
}

export async function recalculateBookingStatus(bookingId: string) {
  const [booking, agg] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { totalAmount: true, paidOnKhelomore: true },
    }),
    prisma.payment.aggregate({
      where: { bookingId },
      _sum: { amount: true },
    }),
  ]);
  if (!booking) return;

  const total = toNumber(booking.totalAmount);
  const paid = toNumber(agg._sum.amount);

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

export type PaymentWithRecorder = Payment & {
  recordedBy?: { name: string } | null;
};

type SerializeOptions = {
  includeProof?: boolean;
  pendingProofOnly?: boolean;
};

export function serializePayment(
  payment: PaymentWithRecorder,
  options?: SerializeOptions
) {
  const includeProof =
    options?.includeProof ||
    (options?.pendingProofOnly &&
      payment.verificationStatus === VerificationStatus.PENDING);

  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amount: toNumber(payment.amount),
    method: payment.method,
    proofImageUrl: includeProof ? payment.proofImageUrl : null,
    hasProof: !!payment.proofImageUrl,
    extractedSenderName: payment.extractedSenderName,
    extractedAmount: payment.extractedAmount
      ? toNumber(payment.extractedAmount)
      : null,
    verificationStatus: payment.verificationStatus,
    recordedBy: payment.recordedBy ?? null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export function serializeBooking(
  booking: BookingWithPayments & { payments: PaymentWithRecorder[] },
  options?: SerializeOptions
) {
  const paid = getPaidAmount(booking.payments);
  const total = toNumber(booking.totalAmount);
  const pendingVerificationCount = booking.payments.filter(
    (p) => p.verificationStatus === VerificationStatus.PENDING
  ).length;

  return {
    id: booking.id,
    externalId: booking.externalId,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    customerEmail: booking.customerEmail,
    venueName: booking.venueName,
    turfName: booking.turfName,
    location: booking.location,
    bookingDate: booking.bookingDate.toISOString(),
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalAmount: total,
    paidAmount: paid,
    pendingAmount: Math.max(0, total - paid),
    paidOnKhelomore: booking.paidOnKhelomore,
    paymentStatus: booking.paymentStatus,
    pendingVerificationCount,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    payments: booking.payments.map((p) => serializePayment(p, options)),
  };
}

export function serializeBookingListItem(
  booking: Pick<
    Booking,
    | "id"
    | "customerName"
    | "customerPhone"
    | "bookingDate"
    | "startTime"
    | "endTime"
    | "turfName"
    | "totalAmount"
    | "paymentStatus"
    | "paidOnKhelomore"
  > & {
    payments: Pick<Payment, "amount" | "verificationStatus">[];
  }
) {
  const paid = getPaidAmount(booking.payments);
  const total = toNumber(booking.totalAmount);

  return {
    id: booking.id,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    bookingDate: booking.bookingDate.toISOString(),
    startTime: booking.startTime,
    endTime: booking.endTime,
    turfName: booking.turfName,
    totalAmount: total,
    paidAmount: paid,
    pendingAmount: Math.max(0, total - paid),
    paymentStatus: booking.paymentStatus,
    paidOnKhelomore: booking.paidOnKhelomore,
    pendingVerificationCount: booking.payments.filter(
      (p) => p.verificationStatus === VerificationStatus.PENDING
    ).length,
  };
}
