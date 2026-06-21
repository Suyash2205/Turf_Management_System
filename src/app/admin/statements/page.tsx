import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { StatementsClient } from "./statements-client";

export default async function StatementsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/staff");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role="ADMIN" userName={session.user.name} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <StatementsClient />
      </main>
    </div>
  );
}
