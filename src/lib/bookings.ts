import { prisma } from "@/lib/db";
import {
  BookingPaymentStatus,
  PaymentMethod,
  VerificationStatus,
  type Booking,
  type Payment,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { isBase64ProofUrl } from "@/lib/payment-proof";

export function toNumber(value: Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return typeof value === "number" ? value : parseFloat(value.toString());
}

export function getVerifiedPaidAmount(
  payments: Pick<Payment, "amount" | "verificationStatus">[]
) {
  return payments
    .filter((p) => p.verificationStatus === VerificationStatus.VERIFIED)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

/** Pending + verified payments (rejected entries are excluded). */
export function getCollectedAmount(
  payments: Pick<Payment, "amount" | "verificationStatus">[]
) {
  return payments
    .filter((p) => p.verificationStatus !== VerificationStatus.REJECTED)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

export function getRemainingBalance(
  booking: Pick<Booking, "totalAmount">,
  payments: Pick<Payment, "id" | "amount" | "verificationStatus">[],
  excludePaymentId?: string
) {
  const collected = payments
    .filter(
      (p) =>
        p.verificationStatus !== VerificationStatus.REJECTED &&
        p.id !== excludePaymentId
    )
    .reduce((sum, p) => sum + toNumber(p.amount), 0);

  return Math.max(0, toNumber(booking.totalAmount) - collected);
}

export function hasRejectedPayments(
  payments: Pick<Payment, "verificationStatus">[]
) {
  return payments.some(
    (p) => p.verificationStatus === VerificationStatus.REJECTED
  );
}

export function getPaidAmount(
  payments: Pick<Payment, "amount" | "verificationStatus">[]
) {
  return getCollectedAmount(payments);
}

export function getPendingAmount(
  booking: Pick<Booking, "totalAmount">,
  payments: Pick<Payment, "amount" | "verificationStatus">[]
) {
  return Math.max(
    0,
    toNumber(booking.totalAmount) - getCollectedAmount(payments)
  );
}

const bookingWithPaymentsInclude = {
  payments: {
    orderBy: { createdAt: "desc" as const },
    include: { recordedBy: { select: { name: true } } },
  },
};

export async function fetchSerializedBooking(
  bookingId: string,
  options?: SerializeOptions
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingWithPaymentsInclude,
  });
  if (!booking) return null;
  return serializeBooking(booking, { pendingProofOnly: true, ...options });
}

export async function recalculateBookingStatus(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: { select: { amount: true, verificationStatus: true } },
    },
  });
  if (!booking) return;

  const total = toNumber(booking.totalAmount);
  const verifiedPaid = getVerifiedPaidAmount(booking.payments);
  const rejected = hasRejectedPayments(booking.payments);
  const awaitingVerification = booking.payments.some(
    (p) => p.verificationStatus === VerificationStatus.PENDING
  );

  let paymentStatus: BookingPaymentStatus;
  if (booking.paidOnKhelomore || verifiedPaid >= total) {
    paymentStatus = BookingPaymentStatus.COMPLETED;
  } else if (rejected && verifiedPaid < total) {
    paymentStatus = BookingPaymentStatus.REJECTED;
  } else if (verifiedPaid > 0 || awaitingVerification) {
    paymentStatus = BookingPaymentStatus.PARTIAL;
  } else {
    paymentStatus = BookingPaymentStatus.PENDING;
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus },
  });
}

export async function recalculateAndSerializeBooking(
  bookingId: string,
  options?: SerializeOptions
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingWithPaymentsInclude,
  });
  if (!booking) return null;

  const total = toNumber(booking.totalAmount);
  const verifiedPaid = getVerifiedPaidAmount(booking.payments);
  const rejected = hasRejectedPayments(booking.payments);
  const awaitingVerification = booking.payments.some(
    (p) => p.verificationStatus === VerificationStatus.PENDING
  );

  let paymentStatus: BookingPaymentStatus;
  if (booking.paidOnKhelomore || verifiedPaid >= total) {
    paymentStatus = BookingPaymentStatus.COMPLETED;
  } else if (rejected && verifiedPaid < total) {
    paymentStatus = BookingPaymentStatus.REJECTED;
  } else if (verifiedPaid > 0 || awaitingVerification) {
    paymentStatus = BookingPaymentStatus.PARTIAL;
  } else {
    paymentStatus = BookingPaymentStatus.PENDING;
  }

  if (booking.paymentStatus !== paymentStatus) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus },
    });
    booking.paymentStatus = paymentStatus;
  }

  return serializeBooking(booking, { pendingProofOnly: true, ...options });
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

  const showBlobUrl =
    includeProof &&
    payment.proofImageUrl &&
    !isBase64ProofUrl(payment.proofImageUrl);

  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amount: toNumber(payment.amount),
    method: payment.method,
    proofImageUrl: showBlobUrl ? payment.proofImageUrl : null,
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
