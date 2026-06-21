import { cn } from "@/lib/utils";

const variants = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-slate-100 text-slate-700",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: keyof typeof variants;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function paymentStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="success">Paid</Badge>;
    case "PARTIAL":
      return <Badge variant="warning">Partial</Badge>;
    default:
      return <Badge variant="danger">Pending</Badge>;
  }
}

export function verificationBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="success">Verified</Badge>;
    case "REJECTED":
      return <Badge variant="danger">Rejected</Badge>;
    default:
      return <Badge variant="warning">Pending</Badge>;
  }
}
