"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  ClipboardList,
  LogOut,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface NavProps {
  role: "STAFF" | "ADMIN";
  userName: string;
}

type NavLink = {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  verifyTab?: boolean;
};

const staffLinks: NavLink[] = [
  { href: "/staff", label: "Bookings", shortLabel: "Bookings", icon: ClipboardList },
];

const adminLinks: NavLink[] = [
  { href: "/admin", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/admin/bookings", label: "Bookings", shortLabel: "Bookings", icon: ClipboardList },
  {
    href: "/admin/bookings?verify=pending",
    label: "Verify",
    shortLabel: "Verify",
    icon: ShieldCheck,
    verifyTab: true,
  },
  {
    href: "/admin/statements",
    label: "Bank Statements",
    shortLabel: "Statements",
    icon: FileText,
  },
];

function linkIsActive(
  link: NavLink,
  pathname: string,
  verifyPending: boolean
) {
  if (link.verifyTab) {
    return pathname.startsWith("/admin/bookings") && verifyPending;
  }
  if (link.href === "/admin/bookings") {
    return pathname.startsWith("/admin/bookings") && !verifyPending;
  }
  if (link.href === "/admin") {
    return pathname === "/admin";
  }
  if (link.href === "/staff") {
    return pathname === "/staff" || pathname.startsWith("/staff/");
  }
  return pathname === link.href || pathname.startsWith(link.href + "/");
}

function NavLinks({
  links,
  pathname,
  verifyPending,
  variant,
}: {
  links: NavLink[];
  pathname: string;
  verifyPending: boolean;
  variant: "header" | "bottom";
}) {
  return (
    <>
      {links.map((link) => {
        const Icon = link.icon;
        const active = linkIsActive(link, pathname, verifyPending);
        const isBottom = variant === "bottom";

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "transition-colors",
              isBottom
                ? cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium sm:text-xs",
                    active
                      ? "text-emerald-700"
                      : "text-slate-500 active:text-emerald-600"
                  )
                : cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  )
            )}
          >
            <Icon
              className={cn(
                "shrink-0",
                isBottom ? "h-5 w-5" : "h-4 w-4",
                isBottom && active && "text-emerald-600"
              )}
            />
            <span className={cn(isBottom && "truncate")}>
              {isBottom ? link.shortLabel : link.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

function MobileBottomNav({ role }: { role: "STAFF" | "ADMIN" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const verifyPending = searchParams.get("verify") === "pending";
  const links = role === "ADMIN" ? adminLinks : staffLinks;

  if (role !== "ADMIN") {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        <NavLinks
          links={links}
          pathname={pathname}
          verifyPending={verifyPending}
          variant="bottom"
        />
      </div>
    </nav>
  );
}

export function AppNav({ role, userName }: NavProps) {
  const pathname = usePathname();
  const links = role === "ADMIN" ? adminLinks : staffLinks;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href={role === "ADMIN" ? "/admin" : "/staff"}
              className="shrink-0 font-bold text-emerald-700"
            >
              TurfPay
            </Link>
            <nav className="hidden gap-1 sm:flex">
              <Suspense fallback={null}>
                <NavLinksWithSearch
                  links={links}
                  pathname={pathname}
                  variant="header"
                />
              </Suspense>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[8rem] truncate text-sm text-slate-500 md:inline">
              {userName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 sm:px-3"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <MobileBottomNav role={role} />
      </Suspense>
    </>
  );
}

function NavLinksWithSearch({
  links,
  pathname,
  variant,
}: {
  links: NavLink[];
  pathname: string;
  variant: "header" | "bottom";
}) {
  const searchParams = useSearchParams();
  const verifyPending = searchParams.get("verify") === "pending";

  return (
    <NavLinks
      links={links}
      pathname={pathname}
      verifyPending={verifyPending}
      variant={variant}
    />
  );
}
