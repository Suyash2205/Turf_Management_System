"use client";

import { verificationBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { paymentProofUrl } from "@/lib/payment-proof";
import {
  VerifyPaymentButtons,
  type VerifyAction,
  type VerifyState,
} from "@/components/verify-payment-buttons";

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
  verifyState: VerifyState;
  onVerify: (paymentId: string, status: VerifyAction) => void | Promise<void>;
}

export function PaymentVerificationPanel({
  payment,
  verifyState,
  onVerify,
}: PaymentVerificationPanelProps) {
  const proofUrl = paymentProofUrl(payment.id);
  const hasProof = payment.hasProof || !!payment.proofImageUrl;

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
        {hasProof && (
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={proofUrl}
              alt="Payment proof"
              className="mt-2 max-h-48 rounded-lg border"
            />
          </a>
        )}
      </div>
      {payment.verificationStatus === "PENDING" && (
        <VerifyPaymentButtons
          paymentId={payment.id}
          verifyState={verifyState}
          onVerify={onVerify}
          className="flex gap-2"
        />
      )}
    </div>
  );
}
