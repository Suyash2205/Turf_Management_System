import { VerificationStatus, type Payment, type UserRole } from "@prisma/client";

export function canStaffModifyPayment(payment: Pick<Payment, "verificationStatus">) {
  return (
    payment.verificationStatus === VerificationStatus.PENDING ||
    payment.verificationStatus === VerificationStatus.REJECTED
  );
}

export function canModifyPayment(
  role: UserRole,
  payment: Pick<Payment, "verificationStatus">
) {
  if (role === "ADMIN") return true;
  return canStaffModifyPayment(payment);
}

export function canDeletePayment(
  role: UserRole,
  payment: Pick<Payment, "verificationStatus">
) {
  if (role === "ADMIN") return true;
  return canStaffModifyPayment(payment);
}

export function canRecordPayment(booking: {
  paidOnKhelomore: boolean;
  pendingAmount: number;
  paymentStatus: string;
}) {
  if (booking.paidOnKhelomore) return false;
  if (booking.paymentStatus === "REJECTED") return true;
  return booking.pendingAmount > 0;
}
