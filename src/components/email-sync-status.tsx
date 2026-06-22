"use client";

import { useEffect, useState } from "react";

type EmailSyncStatusData = {
  lastSyncedAt: string | null;
  emailsFound: number;
  bookingsCreated: number;
  errors: string | null;
  schedule: string;
};

function formatSyncTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function EmailSyncStatus({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<EmailSyncStatusData | null>(null);

  useEffect(() => {
    fetch("/api/email/sync/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  return (
    <div className={className}>
      <p className="text-xs text-slate-500">
        {status.lastSyncedAt ? (
          <>
            Last Gmail sync:{" "}
            <span className="font-medium text-slate-700">
              {formatSyncTime(status.lastSyncedAt)}
            </span>
            {" · "}
            {status.emailsFound} emails checked
            {status.bookingsCreated > 0
              ? `, ${status.bookingsCreated} new booking${status.bookingsCreated === 1 ? "" : "s"}`
              : ""}
          </>
        ) : (
          "No Gmail sync recorded yet"
        )}
      </p>
      <p className="text-xs text-slate-400">{status.schedule}</p>
    </div>
  );
}
