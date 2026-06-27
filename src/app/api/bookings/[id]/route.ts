import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { formatDate } from "@/lib/utils";

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
