import { NextResponse } from "next/server";
import { BookingAdjustmentType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  syncBookingAfterAdjustmentChange,
} from "@/lib/booking-adjustments";
import { toNumber } from "@/lib/bookings";
import { logAudit } from "@/lib/audit-log";

function canModifyAdjustments(paidOnKhelomore: boolean) {
  return !paidOnKhelomore;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId, adjustmentId } = await params;

  try {
    const existing = await prisma.bookingAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { booking: { select: { customerName: true, paidOnKhelomore: true } } },
    });

    if (!existing || existing.bookingId !== bookingId) {
      return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
    }

    if (!canModifyAdjustments(existing.booking.paidOnKhelomore)) {
      return NextResponse.json({ error: "Cannot edit this booking" }, { status: 403 });
    }

    const body = await request.json();
    const description =
      body.description != null ? String(body.description).trim() : existing.description;
    const amount =
      body.amount != null ? parseFloat(body.amount) : toNumber(existing.amount);
    const hours =
      body.hours != null && body.hours !== ""
        ? parseFloat(body.hours)
        : existing.hoursAdded
          ? toNumber(existing.hoursAdded)
          : undefined;

    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
    }

    if (existing.type === BookingAdjustmentType.EXTRA_HOURS) {
      if (hours == null || !Number.isFinite(hours) || hours <= 0 || hours > 12) {
        return NextResponse.json(
          { error: "Enter extra hours between 0.5 and 12" },
          { status: 400 }
        );
      }
    }

    await prisma.bookingAdjustment.update({
      where: { id: adjustmentId },
      data: {
        description:
          existing.type === BookingAdjustmentType.EXTRA_HOURS
            ? `Extra ${hours} hr${hours === 1 ? "" : "s"}`
            : description,
        amount,
        hoursAdded:
          existing.type === BookingAdjustmentType.EXTRA_HOURS ? hours : null,
      },
    });

    const booking = await syncBookingAfterAdjustmentChange(bookingId);

    await logAudit({
      action: "BOOKING_EXTRA_UPDATED",
      session,
      summary: `${session.user.email} updated ${existing.type === BookingAdjustmentType.EXTRA_HOURS ? "extra hours" : existing.description} for ${existing.booking.customerName}`,
      entityType: "adjustment",
      entityId: adjustmentId,
      bookingId,
      details: {
        type: existing.type,
        description,
        amount,
        hours: hours ?? null,
        customerName: existing.booking.customerName,
      },
      request,
    });

    return NextResponse.json({ booking });
  } catch (error) {
    console.error("Adjustment update error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update adjustment",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId, adjustmentId } = await params;

  try {
    const existing = await prisma.bookingAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { booking: { select: { customerName: true, paidOnKhelomore: true } } },
    });

    if (!existing || existing.bookingId !== bookingId) {
      return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
    }

    if (!canModifyAdjustments(existing.booking.paidOnKhelomore)) {
      return NextResponse.json({ error: "Cannot edit this booking" }, { status: 403 });
    }

    await prisma.bookingAdjustment.delete({ where: { id: adjustmentId } });
    const booking = await syncBookingAfterAdjustmentChange(bookingId);

    await logAudit({
      action: "BOOKING_EXTRA_REMOVED",
      session,
      summary: `${session.user.email} removed ${existing.description} (₹${toNumber(existing.amount).toLocaleString("en-IN")}) for ${existing.booking.customerName}`,
      entityType: "adjustment",
      entityId: adjustmentId,
      bookingId,
      details: {
        type: existing.type,
        description: existing.description,
        amount: toNumber(existing.amount),
        customerName: existing.booking.customerName,
      },
      request,
    });

    return NextResponse.json({ booking });
  } catch (error) {
    console.error("Adjustment delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to remove adjustment",
      },
      { status: 500 }
    );
  }
}
