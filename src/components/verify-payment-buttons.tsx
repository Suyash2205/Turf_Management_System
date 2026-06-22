"use client";

import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VerifyAction = "VERIFIED" | "REJECTED";

export type VerifyState = {
  paymentId: string;
  action: VerifyAction;
} | null;

interface VerifyPaymentButtonsProps {
  paymentId: string;
  verifyState: VerifyState;
  onVerify: (paymentId: string, status: VerifyAction) => void;
  className?: string;
}

export function VerifyPaymentButtons({
  paymentId,
  verifyState,
  onVerify,
  className,
}: VerifyPaymentButtonsProps) {
  const busy = verifyState?.paymentId === paymentId;
  const verifying = busy && verifyState?.action === "VERIFIED";
  const rejecting = busy && verifyState?.action === "REJECTED";

  return (
    <div className={className ?? "flex justify-end gap-2"}>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => onVerify(paymentId, "VERIFIED")}
      >
        {verifying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {verifying ? "Verifying…" : "Verify"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onVerify(paymentId, "REJECTED")}
      >
        {rejecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
        {rejecting ? "Rejecting…" : "Reject"}
      </Button>
    </div>
  );
}
