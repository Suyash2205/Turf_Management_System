"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verificationBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export interface VerifiablePayment {
  id: string;
  amount: number;
  method: string;
  proofImageUrl: string | null;
  hasProof?: boolean;
  extractedSenderName: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
  recordedBy?: { name: string } | null;
}

interface PaymentVerificationPanelProps {
  payment: VerifiablePayment;
  onVerify: (paymentId: string, status: "VERIFIED" | "REJECTED") => void | Promise<void>;
  verifying?: boolean;
}

export function PaymentVerificationPanel({
  payment,
  onVerify,
  verifying = false,
}: PaymentVerificationPanelProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold">{formatCurrency(payment.amount)}</p>
          {verificationBadge(payment.verificationStatus)}
        </div>
        <p className="text-sm text-slate-500">
          {payment.method === "CASH" ? "Cash payment" : "Online payment"}
          {payment.recordedBy && ` · Recorded by ${payment.recordedBy.name}`}
        </p>
        {payment.extractedSenderName && (
          <p className="text-sm text-slate-600">
            OCR: {payment.extractedSenderName}
            {payment.extractedAmount && ` · ${formatCurrency(payment.extractedAmount)}`}
          </p>
        )}
        {payment.proofImageUrl ? (
          <a
            href={payment.proofImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={payment.proofImageUrl}
              alt="Payment proof"
              className="mt-2 max-h-48 rounded-lg border"
            />
          </a>
        ) : payment.hasProof ? (
          <a
            href={`/api/payments/${payment.id}/proof`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-600"
          >
            View payment proof
          </a>
        ) : null}
      </div>
      {payment.verificationStatus === "PENDING" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={verifying}
            onClick={() => onVerify(payment.id, "VERIFIED")}
          >
            <Check className="h-4 w-4" />
            Verify
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={verifying}
            onClick={() => onVerify(payment.id, "REJECTED")}
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
