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
    async function load() {
      try {
        const res = await fetch("/api/email/sync/status");
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch {
        setStatus(null);
      }
    }

    load();

    // Sync runs once a day via cron, so refresh only when the user returns to
    // the tab instead of polling every minute (which kept a Vercel Fluid
    // instance warm 24/7 and ran a DB query per minute, even in background tabs).
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
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
