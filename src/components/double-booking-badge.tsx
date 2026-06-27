import { Badge } from "@/components/ui/badge";

export function DoubleBookingBadge() {
  return (
    <Badge variant="danger" className="font-semibold">
      Double booking — needs to be checked
    </Badge>
  );
}

export const doubleBookingCardClass =
  "border-red-400 bg-red-50/70 ring-1 ring-red-300 hover:border-red-500";
