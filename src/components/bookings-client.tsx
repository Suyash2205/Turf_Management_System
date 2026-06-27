"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, paymentStatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useLoading } from "@/components/loading-provider";
import { EmailSyncStatus } from "@/components/email-sync-status";
import {
  DoubleBookingBadge,
  doubleBookingCardClass,
} from "@/components/double-booking-badge";
import { AddBookingForm } from "@/components/add-booking-form";

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  turfName?: string | null;
  venueName?: string | null;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: string;
  paidOnKhelomore: boolean;
  pendingVerificationCount?: number;
  isDoubleBooking?: boolean;
}

export function BookingsClient({
  mode = "staff",
  defaultVenueName = "Lush Sports",
}: {
  mode?: "staff" | "admin";
  defaultVenueName?: string;
}) {
  const searchParams = useSearchParams();
  const isAdmin = mode === "admin";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(
    searchParams.get("date") || format(new Date(), "yyyy-MM-dd")
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [verifyFilter, setVerifyFilter] = useState(
    searchParams.get("verify") === "pending"
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const { run } = useLoading();

  async function loadBookings(forDate?: string) {
    setLoading(true);
    const listDate = forDate ?? date;
    try {
      await run(async () => {
        const params = new URLSearchParams();
        if (!verifyFilter) params.set("date", listDate);
        if (statusFilter) params.set("status", statusFilter);
        if (verifyFilter) params.set("verify", "pending");
        const res = await fetch(`/api/bookings?${params}`);
        const data = await res.json();
        setBookings(data);
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [date, statusFilter, verifyFilter]);

  function bookingHref(id: string) {
    return isAdmin ? `/admin/bookings/${id}` : `/staff/bookings/${id}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAdmin ? "Bookings" : "Today\u2019s Bookings"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "View bookings and verify payments"
              : "Collect and record payments"}
          </p>
          {!isAdmin && <EmailSyncStatus className="mt-1" />}
        </div>
        <Button
          variant="outline"
          onClick={() => void loadBookings()}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        {!verifyFilter && (
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto"
          />
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="COMPLETED">Completed</option>
        </select>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setVerifyFilter((v) => !v)}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:w-auto ${
              verifyFilter
                ? "border-purple-500 bg-purple-50 text-purple-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Needs verification
          </button>
        )}
      </div>

      <AddBookingForm
        defaultVenueName={defaultVenueName}
        onCreated={(_bookingId, bookingDate) => {
          if (bookingDate) setDate(bookingDate);
          void loadBookings(bookingDate);
        }}
      />

      {loading ? (
        <p className="text-slate-500">Loading bookings...</p>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {verifyFilter
              ? "No bookings pending verification."
              : "No bookings found for this date."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {bookings.map((booking, index) => {
            const needsVerify = (booking.pendingVerificationCount ?? 0) > 0;
            const isDouble = booking.isDoubleBooking ?? false;
            return (
              <Link
                key={booking.id}
                href={bookingHref(booking.id)}
                onClick={() => setActiveId(booking.id)}
              >
                <Card
                  className={`transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
                    isDouble ? doubleBookingCardClass : ""
                  } ${
                    activeId === booking.id
                      ? isDouble
                        ? "scale-[0.98] shadow-md"
                        : "scale-[0.98] border-emerald-400 bg-emerald-50/40 shadow-md"
                      : ""
                  }`}
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          isDouble
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className={`font-semibold ${
                              isDouble ? "text-red-900" : "text-slate-900"
                            }`}
                          >
                            {booking.customerName}
                          </h3>
                          {isDouble && <DoubleBookingBadge />}
                          {paymentStatusBadge(booking.paymentStatus)}
                          {booking.paidOnKhelomore && (
                            <span className="text-xs text-emerald-600">
                              Khelomore paid
                            </span>
                          )}
                          {needsVerify && (
                            <Badge variant="warning">
                              {booking.pendingVerificationCount} to verify
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          {formatDate(booking.bookingDate)}
                          {booking.startTime && ` · ${booking.startTime}`}
                          {booking.endTime && ` - ${booking.endTime}`}
                        </p>
                        {booking.turfName && (
                          <p className="text-xs text-slate-400">{booking.turfName}</p>
                        )}
                        {booking.venueName && (
                          <p className="text-xs text-slate-400">{booking.venueName}</p>
                        )}
                        {booking.customerPhone && (
                          <p className="text-sm text-slate-500">
                            {booking.customerPhone}
                          </p>
                        )}
                        {isAdmin && needsVerify && (
                          <p className="mt-1 text-xs font-medium text-purple-600">
                            Tap to verify payment →
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(booking.totalAmount)}
                      </p>
                      {booking.pendingAmount > 0 && (
                        <p className="text-sm text-amber-600">
                          Pending: {formatCurrency(booking.pendingAmount)}
                        </p>
                      )}
                      {booking.paidAmount > 0 && (
                        <p className="text-sm text-emerald-600">
                          Collected: {formatCurrency(booking.paidAmount)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
