import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeBookingListItem } from "@/lib/bookings";
import { markDoubleBookingFlags } from "@/lib/double-booking";
import { logAudit } from "@/lib/audit-log";
import {
  buildManualBookingEmailMessageId,
  parseManualBookingBody,
} from "@/lib/manual-booking";
import { startOfDay, endOfDay } from "date-fns";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const verifyPending = searchParams.get("verify") === "pending";

  const where: Record<string, unknown> = {};

  if (date) {
    const d = new Date(date);
    where.bookingDate = {
      gte: startOfDay(d),
      lte: endOfDay(d),
    };
  }

  if (status) {
    where.paymentStatus = status;
  }

  if (verifyPending) {
    where.payments = { some: { verificationStatus: "PENDING" } };
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      venueName: true,
      turfName: true,
      totalAmount: true,
      paymentStatus: true,
      paidOnKhelomore: true,
      payments: {
        select: { amount: true, verificationStatus: true },
      },
    },
  });

  const doubleFlags = markDoubleBookingFlags(bookings);

  return NextResponse.json(
    bookings.map((booking) => ({
      ...serializeBookingListItem(booking),
      venueName: booking.venueName,
      isDoubleBooking: doubleFlags.get(booking.id) ?? false,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = parseManualBookingBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.externalId) {
    const existing = await prisma.booking.findFirst({
      where: {
        OR: [
          { externalId: parsed.externalId },
          { externalId: { startsWith: `${parsed.externalId}#` } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A booking with this Khelomore ID already exists" },
        { status: 409 }
      );
    }
  }

  const defaultVenue = process.env.KHELOMORE_VENUE_NAME?.trim();
  const paidOnKhelomore = parsed.paidOnKhelomore ?? false;

  const booking = await prisma.booking.create({
    data: {
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      customerEmail: parsed.customerEmail,
      bookingDate: new Date(parsed.bookingDate),
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      venueName: parsed.venueName || defaultVenue || null,
      turfName: parsed.turfName,
      location: parsed.location,
      slotPrice: parsed.slotPrice ?? parsed.totalAmount,
      couponAmount: parsed.couponAmount,
      totalAmount: parsed.totalAmount,
      externalId: parsed.externalId,
      paidOnKhelomore,
      paymentStatus: paidOnKhelomore ? "COMPLETED" : "PENDING",
      emailMessageId: buildManualBookingEmailMessageId(),
      rawEmailSubject: `Manual entry by ${session.user.email}`,
    },
    include: {
      payments: { select: { amount: true, verificationStatus: true } },
    },
  });

  await logAudit({
    action: "BOOKING_CREATED",
    session,
    summary: `${session.user.email} manually added booking for ${booking.customerName} on ${parsed.bookingDate}${
      parsed.startTime ? ` (${parsed.startTime}${parsed.endTime ? `–${parsed.endTime}` : ""})` : ""
    }`,
    entityType: "booking",
    entityId: booking.externalId ?? booking.id,
    bookingId: booking.id,
    details: {
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      bookingDate: parsed.bookingDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      venueName: booking.venueName,
      turfName: booking.turfName,
      totalAmount: parsed.totalAmount,
      externalId: booking.externalId,
      paidOnKhelomore,
    },
    request,
  });

  const doubleFlags = markDoubleBookingFlags([
    {
      id: booking.id,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      venueName: booking.venueName,
    },
  ]);

  return NextResponse.json(
    {
      ...serializeBookingListItem(booking),
      venueName: booking.venueName,
      isDoubleBooking: doubleFlags.get(booking.id) ?? false,
    },
    { status: 201 }
  );
}
