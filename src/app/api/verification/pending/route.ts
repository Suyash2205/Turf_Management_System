import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializePayment } from "@/lib/bookings";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payments = await prisma.payment.findMany({
    where: { verificationStatus: "PENDING" },
    include: {
      booking: true,
      recordedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    payments.map((p) => ({
      ...serializePayment(p, { pendingProofOnly: true }),
      createdAt: p.createdAt.toISOString(),
      booking: {
        customerName: p.booking.customerName,
        bookingDate: p.booking.bookingDate.toISOString(),
      },
      recordedBy: p.recordedBy,
    }))
  );
}
