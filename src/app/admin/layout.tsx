import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/staff");

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <AppNav role="ADMIN" userName={session.user.name} userEmail={session.user.email} />
      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
