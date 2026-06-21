import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { AdminBookingVerifyClient } from "./admin-booking-verify-client";

export default async function AdminBookingVerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/staff");

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
    },
  });

  if (!booking) notFound();

  const serialized = serializeBooking(booking);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role={session.user.role} userName={session.user.name} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <AdminBookingVerifyClient booking={serialized} />
      </main>
    </div>
  );
}
