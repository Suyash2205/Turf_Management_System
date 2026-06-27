"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoading } from "@/components/loading-provider";

interface AuditLogEntry {
  id: string;
  action: string;
  actionLabel: string;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  entityType: string | null;
  entityId: string | null;
  bookingId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGIN_FAILED", label: "Login failed" },
  { value: "LOGOUT", label: "Logout" },
  { value: "PAYMENT_RECORDED", label: "Payment recorded" },
  { value: "PAYMENT_UPDATED", label: "Payment edited" },
  { value: "PAYMENT_DELETED", label: "Payment deleted" },
  { value: "PAYMENT_VERIFIED", label: "Payment verified" },
  { value: "PAYMENT_REJECTED", label: "Payment rejected" },
  { value: "PAYMENT_AUTO_VERIFIED", label: "Auto-verified" },
  { value: "BOOKING_EXTRA_ADDED", label: "Extra added" },
  { value: "BOOKING_EXTRA_UPDATED", label: "Extra updated" },
  { value: "BOOKING_EXTRA_REMOVED", label: "Extra removed" },
  { value: "BOOKING_EXTRA_HOURS_ADDED", label: "Extra hours added" },
  { value: "EMAIL_SYNC", label: "Email sync" },
  { value: "BOOKING_CANCELLED", label: "Booking cancelled" },
  { value: "BOOKING_DELETED", label: "Booking removed" },
  { value: "BANK_STATEMENT_UPLOADED", label: "Statement upload" },
];

export function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const { run } = useLoading();

  async function loadLogs(nextPage = page) {
    setLoading(true);
    try {
      await run(async () => {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "50",
        });
        if (actionFilter) params.set("action", actionFilter);
        if (emailFilter.trim()) params.set("email", emailFilter.trim());

        const res = await fetch(`/api/audit-logs?${params}`);
        const data = await res.json();
        setLogs(data.logs);
        setPage(data.page);
        setTotalPages(data.totalPages);
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs(1);
  }, [actionFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Activity Log
        </h1>
        <p className="text-sm text-slate-500">
          Every action on the site with who did it and when
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Input
          type="search"
          placeholder="Filter by email"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          className="w-full sm:w-56"
        />
        <Button
          variant="outline"
          onClick={() => loadLogs(1)}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Search
        </Button>
      </div>

      {loading && logs.length === 0 ? (
        <p className="text-slate-500">Loading activity…</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No activity found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardContent className="space-y-1 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{log.summary}</p>
                    <p className="text-sm text-slate-500">
                      {log.actionLabel}
                      {log.userEmail && (
                        <>
                          {" · "}
                          <span className="font-medium text-slate-700">
                            {log.userEmail}
                          </span>
                          {log.userRole && ` (${log.userRole})`}
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <p className="text-xs text-slate-500">
                    {Object.entries(log.details)
                      .filter(([, v]) => v != null && v !== "")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => loadLogs(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => loadLogs(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
