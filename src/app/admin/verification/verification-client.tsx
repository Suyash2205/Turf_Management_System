"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verificationBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface PendingPayment {
  id: string;
  amount: number;
  method: string;
  proofImageUrl: string | null;
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

  async function loadPayments() {
    setLoading(true);
    const res = await fetch("/api/verification/pending");
    const data = await res.json();
    setPayments(data);
    setLoading(false);
  }

  async function verifyPayment(paymentId: string, status: "VERIFIED" | "REJECTED") {
    await fetch("/api/payments/verify", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status }),
    });
    loadPayments();
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
                    {p.proofImageUrl && (
                      <a
                        href={p.proofImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                      >
                        <img
                          src={p.proofImageUrl}
                          alt="Payment proof"
                          className="mt-2 max-h-32 rounded-lg border"
                        />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => verifyPayment(p.id, "VERIFIED")}
                    >
                      <Check className="h-4 w-4" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => verifyPayment(p.id, "REJECTED")}
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
