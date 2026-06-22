"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentStatusBadge } from "@/components/ui/badge";
import { PaymentRecordForm } from "@/components/payment-record-form";
import { PaymentHistoryItem } from "@/components/payment-history-item";
import { canRecordPayment } from "@/lib/payment-access";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";
import { useLoading } from "@/components/loading-provider";

interface Payment {
  id: string;
  amount: number;
  method: string;
  proofImageUrl: string | null;
  hasProof?: boolean;
  extractedSenderName: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
  createdAt: string;
}

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: string;
  paidOnKhelomore: boolean;
  payments: Payment[];
}

export function PaymentEntryClient({ booking: initialBooking }: { booking: Booking }) {
  const [booking, setBooking] = useState(initialBooking);
  const { run } = useLoading();

  async function refreshBooking() {
    await run(async () => {
      const res = await fetch(`/api/bookings/${booking.id}`);
      if (res.ok) {
        setBooking(await res.json());
      }
    });
  }

  const showRecordForm = canRecordPayment(booking);

  return (
    <div className="space-y-4">
      <Link
        href="/staff"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bookings
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{booking.customerName}</CardTitle>
            {paymentStatusBadge(booking.paymentStatus)}
          </div>
          <p className="text-sm text-slate-500">
            {formatDate(booking.bookingDate)}
            {booking.startTime && ` · ${booking.startTime}`}
            {booking.endTime && ` - ${booking.endTime}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold">{formatCurrency(booking.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Collected</span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(booking.paidAmount)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Pending</span>
            <span className="font-semibold text-amber-600">
              {formatCurrency(booking.pendingAmount)}
            </span>
          </div>
          {booking.paymentStatus === "REJECTED" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              A payment was rejected. Please record the correct payment again.
            </p>
          )}
        </CardContent>
      </Card>

      {showRecordForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentRecordForm
              bookingId={booking.id}
              maxAmount={booking.pendingAmount}
              onSuccess={refreshBooking}
            />
          </CardContent>
        </Card>
      )}

      {booking.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {booking.payments.map((p) => (
              <PaymentHistoryItem
                key={p.id}
                payment={p}
                canEdit={p.verificationStatus !== "VERIFIED"}
                maxEditAmount={Math.max(
                  0,
                  booking.totalAmount - (booking.paidAmount - p.amount)
                )}
                onUpdated={refreshBooking}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
