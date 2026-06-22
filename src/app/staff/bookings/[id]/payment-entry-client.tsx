"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paymentStatusBadge, verificationBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { compressImage } from "@/lib/compress-image";

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [booking, setBooking] = useState(initialBooking);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "ONLINE">("CASH");
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [compressing, setCompressing] = useState(false);

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

  async function refreshBooking() {
    const res = await fetch(`/api/bookings/${booking.id}`);
    if (res.ok) {
      setBooking(await res.json());
    }
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

      const formData = new FormData();
      formData.append("bookingId", booking.id);
      formData.append("amount", amount);
      formData.append("method", method);
      if (proofImage) formData.append("proofImage", proofImage);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const res = await fetch("/api/payments", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let data: { error?: string };
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
      await refreshBooking();
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
        </CardContent>
      </Card>

      {booking.pendingAmount > 0 && !booking.paidOnKhelomore && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Amount (₹)</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max ${booking.pendingAmount}`}
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
                  <label className="mb-2 block text-sm font-medium">
                    Payment screenshot
                  </label>
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
                {loading ? "Submitting..." : compressing ? "Preparing image..." : "Submit Payment"}
              </Button>
            </form>
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
              <div
                key={p.id}
                className="flex items-start justify-between rounded-lg border border-slate-100 p-3"
              >
                <div>
                  <p className="font-medium">{formatCurrency(p.amount)}</p>
                  <p className="text-sm text-slate-500">
                    {p.method === "CASH" ? "Cash" : "Online"}
                  </p>
                  {p.extractedSenderName && (
                    <p className="text-xs text-slate-400">
                      From: {p.extractedSenderName}
                      {p.extractedAmount && ` · ₹${p.extractedAmount}`}
                    </p>
                  )}
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
