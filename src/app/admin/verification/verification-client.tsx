"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { verificationBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { paymentProofUrl } from "@/lib/payment-proof";
import { useLoading } from "@/components/loading-provider";
import {
  VerifyPaymentButtons,
  type VerifyAction,
  type VerifyState,
} from "@/components/verify-payment-buttons";

interface PendingPayment {
  id: string;
  amount: number;
  method: string;
  proofImageUrl: string | null;
  hasProof?: boolean;
  extractedSenderName: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
  createdAt: string;
  booking: {
    customerName: string;
    bookingDate: string;
  };
  recordedBy: { name: string } | null;
}

export function VerificationClient() {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyState, setVerifyState] = useState<VerifyState>(null);
  const { run } = useLoading();

  async function loadPayments() {
    setLoading(true);
    try {
      await run(async () => {
        const res = await fetch("/api/verification/pending");
        const data = await res.json();
        setPayments(data);
      });
    } finally {
      setLoading(false);
    }
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
        if (res.ok) {
          setPayments((prev) => prev.filter((p) => p.id !== paymentId));
        }
      });
    } finally {
      setVerifyState(null);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Verification</h1>
        <p className="text-sm text-slate-500">
          Verify cash manually or review online payments matched from bank statements
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No pending verifications. All caught up!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {payments.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{p.booking.customerName}</h3>
                      {verificationBadge(p.verificationStatus)}
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(p.amount)}</p>
                    <p className="text-sm text-slate-500">
                      {p.method === "CASH" ? "Cash payment" : "Online payment"}
                      {p.recordedBy && ` · Recorded by ${p.recordedBy.name}`}
                    </p>
                    {p.extractedSenderName && (
                      <p className="text-sm text-slate-600">
                        OCR: {p.extractedSenderName}
                        {p.extractedAmount && ` · ${formatCurrency(p.extractedAmount)}`}
                      </p>
                    )}
                    {(p.hasProof || p.proofImageUrl) && (
                      <a
                        href={paymentProofUrl(p.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                      >
                        <img
                          src={paymentProofUrl(p.id)}
                          alt="Payment proof"
                          className="mt-2 max-h-32 rounded-lg border"
                        />
                      </a>
                    )}
                  </div>
                  <VerifyPaymentButtons
                    paymentId={p.id}
                    verifyState={verifyState}
                    onVerify={verifyPayment}
                    className="flex gap-2"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
