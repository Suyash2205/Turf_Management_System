"use client";

import { cn } from "@/lib/utils";

const selectClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export function TimeSlotSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select time",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={cn(selectClassName, !value && "text-slate-400")}
      >
        <option value="">{placeholder}</option>
        {options.map((slot) => (
          <option key={slot} value={slot}>
            {slot}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TurfSelect({
  value,
  onChange,
  options,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-slate-700">Turf *</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={cn(selectClassName, !value && "text-slate-400")}
      >
        <option value="">Select turf</option>
        {options.map((turf) => (
          <option key={turf} value={turf}>
            {turf}
          </option>
        ))}
      </select>
    </label>
  );
}

export { selectClassName };
