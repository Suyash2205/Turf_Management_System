"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paymentStatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  turfName?: string | null;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: string;
  paidOnKhelomore: boolean;
}

export function BookingsClient() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("");

  async function loadBookings() {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/bookings?${params}`);
    const data = await res.json();
    setBookings(data);
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
  }, [date, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today&apos;s Bookings</h1>
          <p className="text-sm text-slate-500">Collect and record payments</p>
        </div>
        <Button variant="outline" onClick={loadBookings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading bookings...</p>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No bookings found for this date.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {bookings.map((booking, index) => (
            <Link key={booking.id} href={`/staff/bookings/${booking.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {booking.customerName}
                        </h3>
                        {paymentStatusBadge(booking.paymentStatus)}
                        {booking.paidOnKhelomore && (
                          <span className="text-xs text-emerald-600">Khelomore paid</span>
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
                      {booking.customerPhone && (
                        <p className="text-sm text-slate-500">{booking.customerPhone}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
