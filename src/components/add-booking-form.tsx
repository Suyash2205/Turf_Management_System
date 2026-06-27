"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "@/components/collapsible-section";
import { TimeSlotSelect, TurfSelect } from "@/components/time-slot-select";
import { BOOKING_TIME_SLOTS, getEndTimeOptions, getStartTimeOptions } from "@/lib/booking-slot-times";
import { TURF_OPTIONS } from "@/lib/turf-options";

type AddBookingFormProps = {
  defaultVenueName: string;
  onCreated: (bookingId: string, bookingDate: string) => void;
};

export function AddBookingForm({
  defaultVenueName,
  onCreated,
}: AddBookingFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueName, setVenueName] = useState(defaultVenueName);
  const [turfName, setTurfName] = useState("");
  const [slotPrice, setSlotPrice] = useState("");
  const [couponAmount, setCouponAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [externalId, setExternalId] = useState("");
  const [paidOnKhelomore, setPaidOnKhelomore] = useState(false);

  const startTimeOptions = useMemo(
    () => getStartTimeOptions(bookingDate),
    [bookingDate]
  );

  const endTimeOptions = useMemo(
    () => getEndTimeOptions(startTime, BOOKING_TIME_SLOTS),
    [startTime]
  );

  function handleBookingDateChange(value: string) {
    setBookingDate(value);
    if (!startTime) return;

    const allowedStarts = getStartTimeOptions(value);
    if (!allowedStarts.includes(startTime)) {
      setStartTime("");
      setEndTime("");
    }
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (endTime && value && !getEndTimeOptions(value).includes(endTime)) {
      setEndTime("");
    }
  }

  function resetForm() {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setBookingDate("");
    setStartTime("");
    setEndTime("");
    setVenueName(defaultVenueName);
    setTurfName("");
    setSlotPrice("");
    setCouponAmount("");
    setTotalAmount("");
    setExternalId("");
    setPaidOnKhelomore(false);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone: customerPhone || undefined,
          customerEmail: customerEmail || undefined,
          bookingDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          venueName: venueName || undefined,
          turfName,
          slotPrice: slotPrice ? parseFloat(slotPrice) : undefined,
          couponAmount: couponAmount ? parseFloat(couponAmount) : undefined,
          totalAmount: parseFloat(totalAmount),
          externalId: externalId || undefined,
          paidOnKhelomore,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add booking");
      }

      setSuccess(`Booking added for ${customerName}.`);
      const savedDate = bookingDate;
      resetForm();
      setOpen(false);
      onCreated(data.id, savedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add booking");
    } finally {
      setLoading(false);
    }
  }

  return (
    <CollapsibleSection
      title="Add booking"
      icon={CalendarPlus}
      open={open}
      onOpenChange={setOpen}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Enter the same details as a Khelomore confirmation email. Use this for
          walk-ins, phone bookings, or slots that never generated an email.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Customer name *</span>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Full name"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Mobile</span>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="10-digit number"
              inputMode="tel"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <Input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@email.com"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Booking date *</span>
            <Input
              type="date"
              value={bookingDate}
              onChange={(e) => handleBookingDateChange(e.target.value)}
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Khelomore booking ID</span>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. 2026-123-ABCD"
            />
          </label>

          <TurfSelect
            value={turfName}
            onChange={setTurfName}
            options={TURF_OPTIONS}
            required
          />

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Venue</span>
            <Input
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Venue name"
            />
          </label>

          <TimeSlotSelect
            label="Start time"
            value={startTime}
            onChange={handleStartTimeChange}
            options={startTimeOptions}
            placeholder="Select start"
          />

          <TimeSlotSelect
            label="End time"
            value={endTime}
            onChange={setEndTime}
            options={endTimeOptions}
            placeholder={startTime ? "Select end" : "Select start first"}
          />

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Slot price (₹)</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={slotPrice}
              onChange={(e) => setSlotPrice(e.target.value)}
              placeholder="Base slot amount"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Coupon (₹)</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={couponAmount}
              onChange={(e) => setCouponAmount(e.target.value)}
              placeholder="Discount from Khelomore"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Total amount (₹) *</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="Amount to collect"
              required
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={paidOnKhelomore}
            onChange={(e) => setPaidOnKhelomore(e.target.checked)}
            className="rounded border-slate-300"
          />
          Paid on Khelomore (no collection needed)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            "Add booking"
          )}
        </Button>
      </form>
    </CollapsibleSection>
  );
}
