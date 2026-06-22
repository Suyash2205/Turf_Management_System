import { Suspense } from "react";
import { BookingsClient } from "@/components/bookings-client";

export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading bookings...</p>}>
      <BookingsClient mode="admin" />
    </Suspense>
  );
}
