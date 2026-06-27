import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/bookings";
import {
  startOfDay,
  endOfDay,
  subDays,
  format,
  eachDayOfInterval,
} from "date-fns";
import { getEmailSyncStatus } from "@/lib/email-sync-status";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");

  const end = endOfDay(new Date());
  const start = startOfDay(subDays(new Date(), days - 1));
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [
    totalBookings,
    completedBookings,
    pendingPayments,
    pendingVerifications,
    payments,
    bookingsByDay,
    lastEmailSync,
  ] = await Promise.all([
    prisma.booking.count({
      where: { bookingDate: { gte: start, lte: end } },
    }),
    prisma.booking.count({
      where: {
        bookingDate: { gte: start, lte: end },
        paymentStatus: "COMPLETED",
      },
    }),
    prisma.booking.count({
      where: {
        bookingDate: { gte: start, lte: end },
        paymentStatus: { in: ["PENDING", "PARTIAL", "REJECTED"] },
      },
    }),
    prisma.payment.count({
      where: { verificationStatus: "PENDING" },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { amount: true, method: true, createdAt: true },
    }),
    prisma.booking.groupBy({
      by: ["bookingDate"],
      where: { bookingDate: { gte: start, lte: end } },
      _count: { id: true },
    }),
    getEmailSyncStatus(),
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

  const todayCollected = payments
    .filter((p) => p.createdAt >= todayStart && p.createdAt <= todayEnd)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);

  const bookingsPerDay = new Map(
    bookingsByDay.map((row) => [
      format(startOfDay(row.bookingDate), "yyyy-MM-dd"),
      row._count.id,
    ])
  );

  const interval = eachDayOfInterval({ start, end });
  const dailyTrend = interval.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const dayKey = format(day, "yyyy-MM-dd");
    const dayPayments = payments.filter(
      (p) => p.createdAt >= dayStart && p.createdAt <= dayEnd
    );
    return {
      date: dayKey,
      label: format(day, "dd MMM"),
      collected: dayPayments.reduce((s, p) => s + toNumber(p.amount), 0),
      bookings: bookingsPerDay.get(dayKey) ?? 0,
    };
  });

  return NextResponse.json({
    summary: {
      totalBookings,
      totalCollected,
      cashCollected,
      onlineCollected,
      todayCollected,
      pendingPayments,
      pendingVerifications,
      completedBookings,
    },
    dailyTrend,
    paymentMethodSplit: [
      { method: "Cash", amount: cashCollected },
      { method: "Online", amount: onlineCollected },
    ],
    emailSync: lastEmailSync,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchBankTransactions } = await import("@/lib/bank-matcher");
  const { statementId } = await request.json();
  if (!statementId) {
    return NextResponse.json({ error: "Missing statementId" }, { status: 400 });
  }

  const matched = await matchBankTransactions(statementId, {
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorName: session.user.name,
    actorRole: session.user.role,
  });
  return NextResponse.json({ matched });
}
