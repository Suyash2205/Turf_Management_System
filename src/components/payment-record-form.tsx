"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compressImage } from "@/lib/compress-image";
import { useLoading } from "@/components/loading-provider";

interface PaymentRecordFormProps {
  bookingId: string;
  maxAmount: number;
  onSuccess: (booking: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: string;
}

export function PaymentRecordForm({
  bookingId,
  maxAmount,
  onSuccess,
  submitLabel = "Submit Payment",
}: PaymentRecordFormProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "ONLINE">("CASH");
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { run } = useLoading();

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setCompressing(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      setProofImage(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setProofImage(file);
      setPreview(URL.createObjectURL(file));
    } finally {
      setCompressing(false);
    }
  }

  function clearProofImage() {
    setProofImage(null);
    setPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (method === "ONLINE" && !proofImage) {
        setError("Please add a payment screenshot");
        return;
      }

      const parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError("Enter a valid amount");
        return;
      }
      if (parsedAmount > maxAmount) {
        setError(`Amount cannot exceed ₹${maxAmount.toLocaleString("en-IN")}`);
        return;
      }

      const formData = new FormData();
      formData.append("bookingId", bookingId);
      formData.append("amount", amount);
      formData.append("method", method);
      if (proofImage) formData.append("proofImage", proofImage);

      const res = await run(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        try {
          return await fetch("/api/payments", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      });

      const text = await res.text();
      let data: { error?: string; booking?: Record<string, unknown> };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server error — please try again");
      }

      if (!res.ok) {
        setError(data.error || "Failed to record payment");
        return;
      }

      setSuccess("Payment recorded successfully!");
      setAmount("");
      clearProofImage();
      if (data.booking) {
        await onSuccess(data.booking);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out — please try again with a smaller image");
      } else {
        setError(err instanceof Error ? err.message : "Failed to record payment");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Amount (₹)</label>
        <Input
          type="number"
          min="1"
          max={maxAmount}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Max ${maxAmount.toLocaleString("en-IN")}`}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Payment method</label>
        <div className="flex gap-2">
          {(["CASH", "ONLINE"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                method === m
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {m === "CASH" ? "Cash" : "Online (UPI)"}
            </button>
          ))}
        </div>
      </div>

      {method === "ONLINE" && (
        <div>
          <label className="mb-2 block text-sm font-medium">Payment screenshot</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 hover:border-emerald-400">
              <Camera className="h-6 w-6 text-slate-400" />
              <span className="text-xs text-slate-500">Take photo</span>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 hover:border-emerald-400">
              <ImageIcon className="h-6 w-6 text-slate-400" />
              <span className="text-xs text-slate-500">From gallery</span>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
          </div>
          {compressing && (
            <p className="mt-2 text-xs text-slate-500">Preparing image…</p>
          )}
          {preview && !compressing && (
            <div className="relative mt-2">
              <img
                src={preview}
                alt="Payment proof"
                className="max-h-48 rounded-lg object-contain"
              />
              <button
                type="button"
                onClick={clearProofImage}
                className="mt-2 text-xs text-slate-500 hover:text-slate-700"
              >
                Remove image
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={loading || compressing}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Submitting..." : compressing ? "Preparing image..." : submitLabel}
      </Button>
    </form>
  );
}
