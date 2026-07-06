import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { formatDate } from "@/lib/utils";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const customerName =
    body && typeof body.customerName === "string" ? body.customerName.trim() : "";

  if (!customerName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (customerName.length > 120) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const existing = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, customerName: true, externalId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (existing.customerName === customerName) {
    return NextResponse.json({ ok: true, customerName });
  }

  await prisma.booking.update({ where: { id }, data: { customerName } });

  await logAudit({
    action: "BOOKING_EXTRA_UPDATED",
    session,
    summary: `${session.user.email} renamed booking "${existing.customerName}" to "${customerName}"`,
    entityType: "booking",
    entityId: existing.externalId ?? existing.id,
    bookingId: existing.id,
    details: {
      previousName: existing.customerName,
      customerName,
      externalId: existing.externalId,
    },
    request,
  });

  return NextResponse.json({ ok: true, customerName });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      customerName: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      venueName: true,
      externalId: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  await prisma.booking.delete({ where: { id } });

  await logAudit({
    action: "BOOKING_DELETED",
    session,
    summary: `${session.user.email} removed booking for ${booking.customerName} on ${formatDate(booking.bookingDate)}${
      booking.startTime ? ` (${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ""})` : ""
    }`,
    entityType: "booking",
    entityId: booking.externalId ?? booking.id,
    details: {
      customerName: booking.customerName,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      startTime: booking.startTime,
      endTime: booking.endTime,
      venueName: booking.venueName,
      externalId: booking.externalId,
    },
    request,
  });

  return NextResponse.json({ ok: true });
}
