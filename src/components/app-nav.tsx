"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface NavProps {
  role: "STAFF" | "ADMIN";
  userName: string;
}

export function AppNav({ role, userName }: NavProps) {
  const pathname = usePathname();

  const staffLinks = [
    { href: "/staff", label: "Bookings", icon: ClipboardList },
  ];

  const adminLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/statements", label: "Bank Statements", icon: ClipboardList },
    { href: "/admin/bookings", label: "Bookings", icon: ShieldCheck },
  ];

  const links = role === "ADMIN" ? adminLinks : staffLinks;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href={role === "ADMIN" ? "/admin" : "/staff"} className="font-bold text-emerald-700">
            TurfPay
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === href || pathname.startsWith(href + "/")
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{userName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
