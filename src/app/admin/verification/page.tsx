import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { VerificationClient } from "./verification-client";

export default async function VerificationPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/staff");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role="ADMIN" userName={session.user.name} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <VerificationClient />
      </main>
    </div>
  );
}
