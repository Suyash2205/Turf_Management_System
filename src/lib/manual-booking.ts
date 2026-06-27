import { isEndTimeAfterStart } from "@/lib/booking-slot-times";

export type ManualBookingInput = {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  bookingDate: string;
  startTime?: string;
  endTime?: string;
  venueName?: string;
  turfName?: string;
  slotPrice?: number;
  couponAmount?: number;
  totalAmount: number;
  externalId?: string;
  paidOnKhelomore?: boolean;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

export function computeManualBookingTotal(
  slotPrice: number,
  couponAmount = 0
) {
  return Math.max(0, slotPrice - couponAmount);
}

export function parseManualBookingBody(
  body: unknown
): ManualBookingInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body" };
  }

  const data = body as Record<string, unknown>;
  const customerName = readString(data.customerName);
  const bookingDate = readString(data.bookingDate);
  const slotPrice = readOptionalNumber(data.slotPrice);
  const couponAmount = readOptionalNumber(data.couponAmount) ?? 0;

  if (!customerName) {
    return { error: "Customer name is required" };
  }
  if (!readString(data.turfName)) {
    return { error: "Select a turf" };
  }
  if (!bookingDate || Number.isNaN(Date.parse(bookingDate))) {
    return { error: "Enter a valid booking date" };
  }
  if (slotPrice == null || slotPrice <= 0) {
    return { error: "Enter a valid slot price" };
  }
  if (couponAmount < 0) {
    return { error: "Enter a valid discount amount" };
  }
  if (couponAmount > slotPrice) {
    return { error: "Discount cannot be more than slot price" };
  }

  const totalAmount = computeManualBookingTotal(slotPrice, couponAmount);
  if (totalAmount <= 0) {
    return { error: "Total amount must be greater than zero" };
  }

  const externalId = readString(data.externalId) || undefined;
  const startTime = readString(data.startTime) || undefined;
  const endTime = readString(data.endTime) || undefined;

  if (
    startTime &&
    endTime &&
    !isEndTimeAfterStart(startTime, endTime)
  ) {
    return { error: "End time must be after start time" };
  }

  return {
    customerName,
    customerPhone: readString(data.customerPhone) || undefined,
    customerEmail: readString(data.customerEmail) || undefined,
    bookingDate,
    startTime,
    endTime,
    venueName: readString(data.venueName) || undefined,
    turfName: readString(data.turfName) || undefined,
    slotPrice,
    couponAmount: couponAmount > 0 ? couponAmount : undefined,
    totalAmount,
    externalId,
    paidOnKhelomore: data.paidOnKhelomore === true,
  };
}

export function buildManualBookingEmailMessageId() {
  return `manual:${crypto.randomUUID()}`;
}
