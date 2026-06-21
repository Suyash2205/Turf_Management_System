import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { StaffBookingsClient } from "./staff-bookings-client";

export default async function StaffPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role={session.user.role} userName={session.user.name} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <StaffBookingsClient />
      </main>
    </div>
  );
}
