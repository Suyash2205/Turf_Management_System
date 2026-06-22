"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verificationBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { paymentProofUrl } from "@/lib/payment-proof";
import { compressImage } from "@/lib/compress-image";
import { useLoading } from "@/components/loading-provider";

export interface PaymentHistoryEntry {
  id: string;
  amount: number;
  method: string;
  proofImageUrl: string | null;
  hasProof?: boolean;
  extractedSenderName: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
}

interface PaymentHistoryItemProps {
  payment: PaymentHistoryEntry;
  canEdit: boolean;
  maxEditAmount: number;
  onUpdated: () => void | Promise<void>;
}

export function PaymentHistoryItem({
  payment,
  canEdit,
  maxEditAmount,
  onUpdated,
}: PaymentHistoryItemProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState<"CASH" | "ONLINE">(
    payment.method as "CASH" | "ONLINE"
  );
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { run } = useLoading();

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const compressed = await compressImage(file);
      setProofImage(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setProofImage(file);
      setPreview(URL.createObjectURL(file));
    }
  }

  function resetEditState() {
    setAmount(String(payment.amount));
    setMethod(payment.method as "CASH" | "ONLINE");
    setProofImage(null);
    setPreview(null);
    setError("");
    setEditing(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError("Enter a valid amount");
        return;
      }
      if (parsedAmount > maxEditAmount) {
        setError(
          `Amount cannot exceed ₹${maxEditAmount.toLocaleString("en-IN")}`
        );
        return;
      }

      await run(async () => {
        const formData = new FormData();
        formData.append("amount", amount);
        formData.append("method", method);
        if (proofImage) formData.append("proofImage", proofImage);

        const res = await fetch(`/api/payments/${payment.id}`, {
          method: "PATCH",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update payment");
          return;
        }

        resetEditState();
        await onUpdated();
      });
    } catch {
      setError("Failed to update payment");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this payment entry?")) return;

    setLoading(true);
    setError("");
    try {
      await run(async () => {
        const res = await fetch(`/api/payments/${payment.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to delete payment");
          return;
        }
        await onUpdated();
      });
    } catch {
      setError("Failed to delete payment");
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={handleSave}
        className="space-y-3 rounded-lg border border-slate-200 p-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Amount (₹)</label>
          <Input
            type="number"
            min="1"
            max={maxEditAmount}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max ${maxEditAmount.toLocaleString("en-IN")}`}
            required
          />
        </div>
        <div className="flex gap-2">
          {(["CASH", "ONLINE"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                method === m
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {m === "CASH" ? "Cash" : "Online"}
            </button>
          ))}
        </div>
        {method === "ONLINE" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              <Camera className="h-5 w-5" />
              New photo
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              <ImageIcon className="h-5 w-5" />
              Gallery
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
          </div>
        )}
        {preview && (
          <img src={preview} alt="New proof" className="max-h-32 rounded-lg" />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={resetEditState}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between rounded-lg border border-slate-100 p-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{formatCurrency(payment.amount)}</p>
          {verificationBadge(payment.verificationStatus)}
        </div>
        <p className="text-sm text-slate-500">
          {payment.method === "CASH" ? "Cash" : "Online"}
        </p>
        {payment.extractedSenderName && (
          <p className="text-xs text-slate-400">
            From: {payment.extractedSenderName}
            {payment.extractedAmount && ` · ₹${payment.extractedAmount}`}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="text-right">
        {(payment.hasProof || payment.proofImageUrl) && (
          <a
            href={paymentProofUrl(payment.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-xs text-blue-600"
          >
            View proof
          </a>
        )}
        {canEdit && (
          <div className="mt-2 flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
