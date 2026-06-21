import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchBankTransactions } from "@/lib/bank-matcher";
import { toNumber } from "@/lib/bookings";
import {
  startOfDay,
  endOfDay,
  subDays,
  format,
  eachDayOfInterval,
} from "date-fns";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");

  const end = endOfDay(new Date());
  const start = startOfDay(subDays(new Date(), days - 1));

  const [bookings, payments, pendingVerifications] = await Promise.all([
    prisma.booking.findMany({
      where: { bookingDate: { gte: start, lte: end } },
      include: { payments: true },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.payment.count({
      where: {
        verificationStatus: "PENDING",
        method: "ONLINE",
      },
    }),
  ]);

  const totalCollected = payments.reduce(
    (sum, p) => sum + toNumber(p.amount),
    0
  );
  const cashCollected = payments
    .filter((p) => p.method === "CASH")
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
  const onlineCollected = payments
    .filter((p) => p.method === "ONLINE")
    .reduce((sum, p) => sum + toNumber(p.amount), 0);

  const pendingPayments = bookings.filter(
    (b) => b.paymentStatus === "PENDING" || b.paymentStatus === "PARTIAL"
  ).length;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const todayPayments = payments.filter(
    (p) => p.createdAt >= todayStart && p.createdAt <= todayEnd
  );
  const todayCollected = todayPayments.reduce(
    (sum, p) => sum + toNumber(p.amount),
    0
  );

  const interval = eachDayOfInterval({ start, end });
  const dailyTrend = interval.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const dayPayments = payments.filter(
      (p) => p.createdAt >= dayStart && p.createdAt <= dayEnd
    );
    return {
      date: format(day, "yyyy-MM-dd"),
      label: format(day, "dd MMM"),
      collected: dayPayments.reduce((s, p) => s + toNumber(p.amount), 0),
      bookings: bookings.filter(
        (b) => b.bookingDate >= dayStart && b.bookingDate <= dayEnd
      ).length,
    };
  });

  const paymentMethodSplit = [
    { method: "Cash", amount: cashCollected },
    { method: "Online", amount: onlineCollected },
  ];

  return NextResponse.json({
    summary: {
      totalBookings: bookings.length,
      totalCollected,
      cashCollected,
      onlineCollected,
      todayCollected,
      pendingPayments,
      pendingVerifications,
      completedBookings: bookings.filter((b) => b.paymentStatus === "COMPLETED")
        .length,
    },
    dailyTrend,
    paymentMethodSplit,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { statementId } = await request.json();
  if (!statementId) {
    return NextResponse.json({ error: "Missing statementId" }, { status: 400 });
  }

  const matched = await matchBankTransactions(statementId);
  return NextResponse.json({ matched });
}
