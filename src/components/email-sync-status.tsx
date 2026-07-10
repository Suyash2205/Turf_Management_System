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

/**
 * The sync runs daily. If it has not run in 36h it is broken, and the failure is
 * otherwise invisible: a 401'd cron looks like a success to the scheduler.
 */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function isSyncStale(data: EmailSyncStatusData): boolean {
  if (!data.lastSyncedAt) return true;
  return Date.now() - new Date(data.lastSyncedAt).getTime() > STALE_AFTER_MS;
}

export function EmailSyncStatus({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<EmailSyncStatusData | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/email/sync/status");
        if (res.ok) {
          const data: EmailSyncStatusData = await res.json();
          setStatus(data);
          // Evaluated here, not during render, so the component stays pure.
          setStale(isSyncStale(data));
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

  if (stale) {
    return (
      <div className={className}>
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          ⚠ Gmail sync has not run{" "}
          {status.lastSyncedAt ? (
            <>since {formatSyncTime(status.lastSyncedAt)}</>
          ) : (
            "at all"
          )}
          . New bookings may be missing from this list.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-xs text-slate-500">
        Last Gmail sync:{" "}
        <span className="font-medium text-slate-700">
          {formatSyncTime(status.lastSyncedAt!)}
        </span>
        {" · "}
        {status.emailsFound} emails checked
        {status.bookingsCreated > 0
          ? `, ${status.bookingsCreated} new booking${status.bookingsCreated === 1 ? "" : "s"}`
          : ""}
      </p>
      <p className="text-xs text-slate-400">{status.schedule}</p>
    </div>
  );
}
