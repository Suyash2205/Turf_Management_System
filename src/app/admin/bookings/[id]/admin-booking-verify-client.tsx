"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentStatusBadge, verificationBadge } from "@/components/ui/badge";
import { PaymentVerificationPanel } from "@/components/payment-verification-panel";
import { formatCurrency, formatDate } from "@/lib/utils";

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
  payments: Payment[];
}

export function AdminBookingVerifyClient({
  booking: initialBooking,
}: {
  booking: Booking;
}) {
  const [booking, setBooking] = useState(initialBooking);
  const [verifying, setVerifying] = useState(false);

  const pendingPayments = booking.payments.filter(
    (p) => p.verificationStatus === "PENDING"
  );
  const otherPayments = booking.payments.filter(
    (p) => p.verificationStatus !== "PENDING"
  );

  async function refreshBooking() {
    const res = await fetch(`/api/bookings/${booking.id}`);
    if (res.ok) setBooking(await res.json());
  }

  async function verifyPayment(
    paymentId: string,
    status: "VERIFIED" | "REJECTED"
  ) {
    setVerifying(true);
    try {
      await fetch("/api/payments/verify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, status }),
      });
      await refreshBooking();
    } finally {
      setVerifying(false);
    }
  }

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
        </CardContent>
      </Card>

      {pendingPayments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verify Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {pendingPayments.map((payment) => (
              <PaymentVerificationPanel
                key={payment.id}
                payment={payment}
                onVerify={verifyPayment}
                verifying={verifying}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No pending payments to verify for this booking.
          </CardContent>
        </Card>
      )}

      {otherPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {otherPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="font-medium">{formatCurrency(p.amount)}</p>
                  <p className="text-sm text-slate-500">
                    {p.method === "CASH" ? "Cash" : "Online"}
                  </p>
                </div>
                <div className="text-right">
                  {verificationBadge(p.verificationStatus)}
                  {(p.proofImageUrl || p.hasProof) && (
                    <a
                      href={p.proofImageUrl || `/api/payments/${p.id}/proof`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-xs text-blue-600"
                    >
                      View proof
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
