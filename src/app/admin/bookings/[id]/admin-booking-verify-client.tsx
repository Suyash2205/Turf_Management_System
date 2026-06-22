"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentStatusBadge } from "@/components/ui/badge";
import { PaymentRecordForm } from "@/components/payment-record-form";
import { PaymentHistoryItem } from "@/components/payment-history-item";
import { canRecordPayment } from "@/lib/payment-access";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  VerifyPaymentButtons,
  type VerifyAction,
  type VerifyState,
} from "@/components/verify-payment-buttons";
import { useLoading } from "@/components/loading-provider";
import { BookingAdjustmentsList } from "@/components/booking-extras-form";

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
  recordedBy?: { name: string } | null;
}

interface BookingAdjustment {
  id: string;
  type: string;
  description: string;
  amount: number;
  hoursAdded: number | null;
  addedBy?: { name: string } | null;
  createdAt: string;
}

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  turfName?: string | null;
  totalAmount: number;
  baseAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: string;
  paidOnKhelomore: boolean;
  adjustments: BookingAdjustment[];
  payments: Payment[];
}

export function AdminBookingVerifyClient({
  booking: initialBooking,
}: {
  booking: Booking;
}) {
  const [booking, setBooking] = useState(initialBooking);
  const [verifyState, setVerifyState] = useState<VerifyState>(null);
  const { run } = useLoading();

  function applyBooking(updated: Record<string, unknown>) {
    setBooking(updated as unknown as Booking);
  }

  async function verifyPayment(paymentId: string, status: VerifyAction) {
    setVerifyState({ paymentId, action: status });
    try {
      await run(async () => {
        const res = await fetch("/api/payments/verify", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId, status }),
        });
        const data = await res.json();
        if (res.ok && data.booking) {
          setBooking(data.booking);
        }
      });
    } finally {
      setVerifyState(null);
    }
  }

  const showRecordForm = canRecordPayment(booking);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/bookings?verify=pending"
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
          {booking.turfName && (
            <p className="text-xs text-slate-400">{booking.turfName}</p>
          )}
          {booking.customerPhone && (
            <p className="text-sm text-slate-500">{booking.customerPhone}</p>
          )}
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
              Payment was rejected. Staff or admin can record payment again below.
            </p>
          )}
        </CardContent>
      </Card>

      <BookingAdjustmentsList
        bookingId={booking.id}
        adjustments={booking.adjustments ?? []}
        baseAmount={booking.baseAmount ?? booking.totalAmount}
        totalAmount={booking.totalAmount}
        canEdit={!booking.paidOnKhelomore}
        onUpdated={applyBooking}
      />

      {showRecordForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentRecordForm
              bookingId={booking.id}
              maxAmount={booking.pendingAmount}
              onSuccess={applyBooking}
            />
          </CardContent>
        </Card>
      )}

      {booking.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {booking.payments.map((p) => (
              <div key={p.id} className="space-y-2">
                <PaymentHistoryItem
                  payment={p}
                  canEdit
                  maxEditAmount={Math.max(
                    0,
                    booking.totalAmount - (booking.paidAmount - p.amount)
                  )}
                  onUpdated={applyBooking}
                />
                {p.verificationStatus === "PENDING" && (
                  <VerifyPaymentButtons
                    paymentId={p.id}
                    verifyState={verifyState}
                    onVerify={verifyPayment}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
