import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { serializeBooking } from "@/lib/bookings";
import { PaymentEntryClient } from "./payment-entry-client";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });

  if (!booking) notFound();

  const serialized = serializeBooking(booking, { pendingProofOnly: true });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role={session.user.role} userName={session.user.name} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <PaymentEntryClient booking={serialized} />
      </main>
    </div>
  );
}
