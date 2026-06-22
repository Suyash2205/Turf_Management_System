import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeBookingListItem } from "@/lib/bookings";
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
      turfName: true,
      totalAmount: true,
      paymentStatus: true,
      paidOnKhelomore: true,
      payments: {
        select: { amount: true, verificationStatus: true },
      },
    },
  });

  return NextResponse.json(bookings.map(serializeBookingListItem));
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
    include: {
      payments: { select: { amount: true, verificationStatus: true } },
    },
  });

  return NextResponse.json(serializeBookingListItem(booking), { status: 201 });
}
