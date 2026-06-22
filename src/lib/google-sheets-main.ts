import {
  PaymentMethod,
  VerificationStatus,
  type Booking,
  type BookingAdjustment,
  type Payment,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBookingBaseAmount } from "@/lib/booking-adjustments";
import {
  getCollectedAmount,
  getPendingAmount,
  toNumber,
} from "@/lib/bookings";

export const MAIN_SHEET_TITLE = "main sheet";

export const MAIN_SHEET_HEADERS = [
  "Date",
  "Day",
  "Ground Name",
  "Name",
  "Details",
  "Start Time",
  "End Time",
  "Booking Amt",
  "Ground Cash",
  "Ground Online",
  "Ground Total",
  "Ball",
  "Bottle",
  "Other Extras",
  "Pending Amount",
  "Verified or Not",
  "Grand Total",
  "Remark",
] as const;

type BookingRow = Booking & {
  payments: Payment[];
  adjustments: BookingAdjustment[];
};

function formatSheetDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatSheetDay(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function activePayments(payments: Payment[]) {
  return payments.filter(
    (payment) => payment.verificationStatus !== VerificationStatus.REJECTED
  );
}

function sumByMethod(
  payments: Payment[],
  method: PaymentMethod
) {
  return activePayments(payments)
    .filter((payment) => payment.method === method)
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
}

function categorizeExtras(adjustments: BookingAdjustment[]) {
  let ball = 0;
  let bottle = 0;
  let other = 0;

  for (const adjustment of adjustments) {
    const amount = toNumber(adjustment.amount);
    const description = adjustment.description.toLowerCase();

    if (/\bball\b/.test(description)) {
      ball += amount;
    } else if (/\b(bottle|water)\b/.test(description)) {
      bottle += amount;
    } else {
      other += amount;
    }
  }

  return { ball, bottle, other };
}

function getVerificationLabel(booking: BookingRow) {
  if (booking.paidOnKhelomore) return "Khelomore Paid";

  const onlinePayments = booking.payments.filter(
    (payment) =>
      payment.method === PaymentMethod.ONLINE &&
      payment.verificationStatus !== VerificationStatus.REJECTED
  );

  if (onlinePayments.length === 0) {
    return booking.paymentStatus === "COMPLETED" ? "Verified" : "Pending";
  }

  const hasPending = onlinePayments.some(
    (payment) => payment.verificationStatus === VerificationStatus.PENDING
  );
  const hasRejected = booking.payments.some(
    (payment) => payment.verificationStatus === VerificationStatus.REJECTED
  );

  if (hasPending) return "Pending Verification";
  if (hasRejected) return "Rejected";
  return "Verified";
}

function getRemark(booking: BookingRow) {
  if (booking.paidOnKhelomore) return "Khelomore";
  if (booking.paymentStatus === "COMPLETED") return "Received";
  if (booking.paymentStatus === "PARTIAL") return "Partial";
  if (booking.paymentStatus === "REJECTED") return "Rejected";
  return "Pending";
}

function formatNumber(value: number) {
  if (value === 0) return "";
  return value;
}

function buildMainSheetRow(booking: BookingRow): (string | number)[] {
  const payments = booking.payments;
  const adjustments = booking.adjustments;
  const groundCash = sumByMethod(payments, PaymentMethod.CASH);
  const groundOnline = sumByMethod(payments, PaymentMethod.ONLINE);
  const groundTotal = getCollectedAmount(payments);
  const bookingAmt = getBookingBaseAmount(booking, adjustments);
  const grandTotal = toNumber(booking.totalAmount);
  const pendingAmount = getPendingAmount(booking, payments);
  const extras = categorizeExtras(adjustments);
  const endTime = booking.slotEndTime ?? booking.endTime ?? "";

  return [
    formatSheetDate(booking.bookingDate),
    formatSheetDay(booking.bookingDate),
    booking.turfName ?? booking.venueName ?? "",
    booking.customerName,
    "Cricket",
    booking.startTime ?? "",
    endTime,
    formatNumber(bookingAmt),
    formatNumber(groundCash),
    formatNumber(groundOnline),
    formatNumber(groundTotal),
    formatNumber(extras.ball),
    formatNumber(extras.bottle),
    formatNumber(extras.other),
    formatNumber(pendingAmount),
    getVerificationLabel(booking),
    formatNumber(grandTotal),
    getRemark(booking),
  ];
}

export async function fetchMainSheetRows() {
  const bookings = await prisma.booking.findMany({
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    include: {
      payments: true,
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });

  return bookings.map(buildMainSheetRow);
}

export function mainSheetValues(rows: (string | number)[][]) {
  return [Array.from(MAIN_SHEET_HEADERS), ...rows];
}
