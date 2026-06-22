"use client";

import { useMemo, useState } from "react";
import { Clock, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { addHoursToTime } from "@/lib/booking-time";

const EXTRA_PRESETS = ["Ball", "Water"] as const;

interface BookingExtrasFormProps {
  bookingId: string;
  endTime: string | null;
  startTime: string | null;
  onSuccess: (booking: Record<string, unknown>) => void | Promise<void>;
}

export function BookingExtrasForm({
  bookingId,
  endTime,
  startTime,
  onSuccess,
}: BookingExtrasFormProps) {
  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraError, setExtraError] = useState("");
  const [extraSuccess, setExtraSuccess] = useState("");

  const [extraHours, setExtraHours] = useState("1");
  const [hoursAmount, setHoursAmount] = useState("");
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursSuccess, setHoursSuccess] = useState("");

  const previewEndTime = useMemo(() => {
    const base = endTime || startTime;
    const hours = parseFloat(extraHours);
    if (!base || !Number.isFinite(hours) || hours <= 0) return null;
    return addHoursToTime(base, hours);
  }, [endTime, startTime, extraHours]);

  async function submitAdjustment(payload: {
    type: "EXTRA_CHARGE" | "EXTRA_HOURS";
    description: string;
    amount: string;
    hours?: string;
  }) {
    const amount = parseFloat(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid amount");
    }

    const res = await fetch(`/api/bookings/${bookingId}/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: payload.type,
        description: payload.description,
        amount,
        hours:
          payload.type === "EXTRA_HOURS" ? parseFloat(payload.hours || "0") : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to update booking");
    }

    if (data.booking) {
      await onSuccess(data.booking);
    }

    return data.booking as { totalAmount: number; endTime?: string | null } | undefined;
  }

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    setExtraLoading(true);
    setExtraError("");
    setExtraSuccess("");

    try {
      const description = extraDescription.trim();
      if (!description) {
        setExtraError("Enter what the extra is for");
        return;
      }

      const amount = parseFloat(extraAmount);
      const booking = await submitAdjustment({
        type: "EXTRA_CHARGE",
        description,
        amount: extraAmount,
      });

      setExtraSuccess(
        booking
          ? `${description} — ${formatCurrency(amount)} added. New total: ${formatCurrency(booking.totalAmount)}`
          : `${description} added successfully.`
      );
      setExtraDescription("");
      setExtraAmount("");
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : "Failed to add extra");
    } finally {
      setExtraLoading(false);
    }
  }

  async function handleAddHours(e: React.FormEvent) {
    e.preventDefault();
    setHoursLoading(true);
    setHoursError("");
    setHoursSuccess("");

    try {
      const hours = parseFloat(extraHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        setHoursError("Enter valid extra hours");
        return;
      }

      const amount = parseFloat(hoursAmount);
      const booking = await submitAdjustment({
        type: "EXTRA_HOURS",
        description: `Extra ${hours} hr${hours === 1 ? "" : "s"}`,
        amount: hoursAmount,
        hours: extraHours,
      });

      const endNote =
        booking?.endTime ? ` End time: ${booking.endTime}.` : "";
      setHoursSuccess(
        booking
          ? `Extra ${hours} hr${hours === 1 ? "" : "s"} — ${formatCurrency(amount)} added.${endNote} New total: ${formatCurrency(booking.totalAmount)}`
          : "Extra hours added successfully."
      );
      setHoursAmount("");
    } catch (err) {
      setHoursError(
        err instanceof Error ? err.message : "Failed to add extra hours"
      );
    } finally {
      setHoursLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-emerald-600" />
            Add extras
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Add charges for ball, water, or other items. Amount is added to the
            booking total.
          </p>

          <div className="flex flex-wrap gap-2">
            {EXTRA_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setExtraDescription(preset);
                  setExtraSuccess("");
                  setExtraError("");
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  extraDescription === preset
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                }`}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setExtraDescription("");
                setExtraSuccess("");
                setExtraError("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-300"
            >
              Other
            </button>
          </div>

          <form onSubmit={handleAddExtra} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Item</label>
              <Input
                value={extraDescription}
                onChange={(e) => {
                  setExtraDescription(e.target.value);
                  setExtraSuccess("");
                }}
                placeholder="e.g. Ball, Water, Bibs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Amount (₹)</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={extraAmount}
                onChange={(e) => {
                  setExtraAmount(e.target.value);
                  setExtraSuccess("");
                }}
                placeholder="Enter amount"
                required
              />
            </div>
            {extraError && <p className="text-sm text-red-600">{extraError}</p>}
            {extraSuccess && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {extraSuccess}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={extraLoading}>
              <Plus className="h-4 w-4" />
              {extraLoading ? "Adding…" : "Add to booking"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-600" />
            Add extra hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Extend the slot and add the charge to the booking total.
          </p>

          <form onSubmit={handleAddHours} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Extra hours</label>
              <Input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={extraHours}
                onChange={(e) => setExtraHours(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Amount for extra hours (₹)
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={hoursAmount}
                onChange={(e) => setHoursAmount(e.target.value)}
                placeholder="Enter amount"
                required
              />
            </div>
            {previewEndTime && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                New end time:{" "}
                <span className="font-semibold">{previewEndTime}</span>
                {endTime && endTime !== previewEndTime && (
                  <span className="text-slate-500"> (was {endTime})</span>
                )}
              </p>
            )}
            {hoursError && <p className="text-sm text-red-600">{hoursError}</p>}
            {hoursSuccess && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {hoursSuccess}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={hoursLoading}>
              <Plus className="h-4 w-4" />
              {hoursLoading ? "Adding…" : "Add extra hours"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
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

export function BookingAdjustmentsList({
  adjustments,
  baseAmount,
  totalAmount,
}: {
  adjustments: BookingAdjustment[];
  baseAmount: number;
  totalAmount: number;
}) {
  if (adjustments.length === 0) return null;

  const extrasTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booking breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Slot / base</span>
          <span>{formatCurrency(baseAmount)}</span>
        </div>
        {adjustments.map((item) => (
          <div key={item.id} className="flex justify-between gap-3">
            <span className="text-slate-600">
              {item.description}
              {item.hoursAdded
                ? ` (+${item.hoursAdded}h)`
                : ""}
            </span>
            <span className="shrink-0 font-medium">
              +{formatCurrency(item.amount)}
            </span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
        {extrasTotal > 0 && adjustments.length > 0 && (
          <p className="text-xs text-slate-400">
            {formatCurrency(extrasTotal)} added in extras &amp; extra hours
          </p>
        )}
      </CardContent>
    </Card>
  );
}
