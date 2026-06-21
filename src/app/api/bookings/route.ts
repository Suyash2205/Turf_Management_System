import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { startOfDay, endOfDay } from "date-fns";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const status = searchParams.get("status");

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

  const bookings = await prisma.booking.findMany({
    where,
    include: { payments: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(bookings.map(serializeBooking));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const booking = await prisma.booking.create({
    data: {
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      bookingDate: new Date(body.bookingDate),
      startTime: body.startTime,
      endTime: body.endTime,
      totalAmount: body.totalAmount,
      paidOnKhelomore: body.paidOnKhelomore ?? false,
      paymentStatus: body.paidOnKhelomore ? "COMPLETED" : "PENDING",
    },
    include: { payments: true },
  });

  return NextResponse.json(serializeBooking(booking), { status: 201 });
}
