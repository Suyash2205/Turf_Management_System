"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function CollapsibleSection({
  title,
  icon: Icon,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  icon: React.ElementType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
          open ? "bg-slate-50" : "hover:bg-slate-50 active:bg-slate-100"
        )}
      >
        <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Icon className="h-4 w-4 text-emerald-600" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-4">
          {children}
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
