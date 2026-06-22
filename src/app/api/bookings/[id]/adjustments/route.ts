import { NextResponse } from "next/server";
import { BookingAdjustmentType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureSlotEndTime,
  syncBookingAfterAdjustmentChange,
} from "@/lib/booking-adjustments";
import { fetchSerializedBooking } from "@/lib/bookings";
import { addHoursToTime } from "@/lib/booking-time";
import { logAudit } from "@/lib/audit-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;

  try {
    const body = await request.json();
    const type = body.type as BookingAdjustmentType;
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const amount = parseFloat(body.amount);
    const hours =
      body.hours != null && body.hours !== ""
        ? parseFloat(body.hours)
        : undefined;

    if (!["EXTRA_CHARGE", "EXTRA_HOURS", "DISCOUNT"].includes(type)) {
      return NextResponse.json({ error: "Invalid adjustment type" }, { status: 400 });
    }

    if (!description && type !== "DISCOUNT") {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const finalDescription =
      type === "DISCOUNT"
        ? description || "Discount"
        : description;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
    }

    if (type === "EXTRA_HOURS") {
      if (hours == null || !Number.isFinite(hours) || hours <= 0 || hours > 12) {
        return NextResponse.json(
          { error: "Enter extra hours between 0.5 and 12" },
          { status: 400 }
        );
      }
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.paidOnKhelomore) {
      return NextResponse.json(
        { error: "Cannot add extras to Khelomore-paid bookings" },
        { status: 403 }
      );
    }

    if (type === BookingAdjustmentType.EXTRA_HOURS) {
      const baseTime = booking.endTime || booking.startTime;
      if (!baseTime) {
        return NextResponse.json(
          { error: "Booking has no time set — cannot extend hours" },
          { status: 400 }
        );
      }
      const extended = addHoursToTime(baseTime, hours!);
      if (!extended) {
        return NextResponse.json({ error: "Invalid booking time" }, { status: 400 });
      }
      await ensureSlotEndTime(bookingId, booking.endTime);
    }

    await prisma.bookingAdjustment.create({
      data: {
        bookingId,
        type,
        description:
          type === BookingAdjustmentType.EXTRA_HOURS
            ? `Extra ${hours} hr${hours === 1 ? "" : "s"}`
            : finalDescription,
        amount,
        hoursAdded: type === BookingAdjustmentType.EXTRA_HOURS ? hours : null,
        addedById: session.user.id,
      },
    });

    const updatedBooking = await syncBookingAfterAdjustmentChange(bookingId);

    await logAudit({
      action:
        type === BookingAdjustmentType.EXTRA_HOURS
          ? "BOOKING_EXTRA_HOURS_ADDED"
          : type === BookingAdjustmentType.DISCOUNT
            ? "BOOKING_EXTRA_ADDED"
            : "BOOKING_EXTRA_ADDED",
      session,
      summary: `${session.user.email} added ${type === BookingAdjustmentType.EXTRA_HOURS ? `${hours} extra hr(s)` : type === BookingAdjustmentType.DISCOUNT ? `discount ${finalDescription}` : finalDescription} (${type === BookingAdjustmentType.DISCOUNT ? "-" : ""}₹${amount.toLocaleString("en-IN")}) for ${booking.customerName}`,
      entityType: "adjustment",
      bookingId,
      details: {
        type,
        description,
        amount,
        hours: hours ?? null,
        customerName: booking.customerName,
      },
      request,
    });

    return NextResponse.json({ booking: updatedBooking }, { status: 201 });
  } catch (error) {
    console.error("Booking adjustment error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add adjustment",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await fetchSerializedBooking(id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(booking);
}
