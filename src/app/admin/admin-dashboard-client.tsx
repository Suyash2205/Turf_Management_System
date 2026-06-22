"use client";

import { useEffect, useState } from "react";
import {
  IndianRupee,
  CalendarCheck,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useLoading } from "@/components/loading-provider";

interface DashboardData {
  summary: {
    totalBookings: number;
    totalCollected: number;
    cashCollected: number;
    onlineCollected: number;
    todayCollected: number;
    pendingPayments: number;
    pendingVerifications: number;
    completedBookings: number;
  };
  dailyTrend: { date: string; label: string; collected: number; bookings: number }[];
  paymentMethodSplit: { method: string; amount: number }[];
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const { run } = useLoading();

  async function loadDashboard() {
    setLoading(true);
    try {
      await run(async () => {
        const res = await fetch("/api/dashboard?days=30");
        const json = await res.json();
        setData(json);
      });
    } finally {
      setLoading(false);
    }
  }

  async function parseSyncResponse(res: Response) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (!res.ok) {
        throw new Error(json.error || `Server error (${res.status})`);
      }
      return json;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Server error")) throw e;
      const preview = text.replace(/\s+/g, " ").slice(0, 80);
      throw new Error(
        res.status === 504 ||
          text.includes("An error") ||
          text.includes("FUNCTION_INVOCATION_TIMEOUT")
          ? `Request timed out (batch too slow). ${preview}`
          : `Bad response: ${preview}`
      );
    }
  }

  async function runBatch(fromDays: number, toDays: number) {
    const res = await fetch(
      `/api/email/sync?full=true&fromDays=${fromDays}&toDays=${toDays}`,
      { method: "POST" }
    );
    return parseSyncResponse(res);
  }

  async function runBatchRange(
    fromDays: number,
    toDays: number,
    depth = 0
  ): Promise<{ emailsFound: number; bookingsCreated: number; emailsSkipped: number }> {
    try {
      const json = await runBatch(fromDays, toDays);
      return {
        emailsFound: json.emailsFound ?? 0,
        bookingsCreated: json.bookingsCreated ?? 0,
        emailsSkipped: json.emailsSkipped ?? 0,
      };
    } catch (err) {
      if (fromDays - toDays <= 1 || depth >= 3) throw err;
      const mid = Math.ceil((fromDays + toDays) / 2);
      setSyncResult(
        `Batch timed out — retrying days ${toDays}–${fromDays} in smaller chunks…`
      );
      await new Promise((r) => setTimeout(r, 1000));
      const first = await runBatchRange(fromDays, mid, depth + 1);
      const second = await runBatchRange(mid, toDays, depth + 1);
      return {
        emailsFound: first.emailsFound + second.emailsFound,
        bookingsCreated: first.bookingsCreated + second.bookingsCreated,
        emailsSkipped: first.emailsSkipped + second.emailsSkipped,
      };
    }
  }

  async function syncEmails(full = false) {
    setSyncing(true);
    setSyncResult("");

    try {
      await run(async () => {
        if (!full) {
          const res = await fetch("/api/email/sync", { method: "POST" });
          const json = await parseSyncResponse(res);
          setSyncResult(
            `Sync: ${json.bookingsCreated} new bookings from ${json.emailsFound} Khelomore emails` +
              (json.emailsSkipped ? ` (${json.emailsSkipped} skipped — other venues)` : "") +
              (json.errors?.length ? ` (${json.errors.length} parse errors)` : "")
          );
          const dashRes = await fetch("/api/dashboard?days=30");
          setData(await dashRes.json());
          return;
        }

        const days = 30;
        let totalFound = 0;
        let totalCreated = 0;
        let totalSkipped = 0;
        const failed: string[] = [];

        for (let d = 0; d < days; d++) {
          const fromDays = d + 1;
          const toDays = d;
          setSyncResult(`Syncing day ${toDays + 1} ago… (${d + 1}/${days})`);

          try {
            const json = await runBatchRange(fromDays, toDays);
            totalFound += json.emailsFound;
            totalCreated += json.bookingsCreated;
            totalSkipped += json.emailsSkipped;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Batch failed";
            failed.push(`day ${toDays + 1} ago: ${msg}`);
          }

          if (d < days - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        const failNote =
          failed.length > 0 ? ` Some days failed: ${failed.join("; ")}.` : "";
        setSyncResult(
          `Full sync done: ${totalCreated} new bookings from ${totalFound} Lush Sports emails (30 days).` +
            (totalSkipped ? ` ${totalSkipped} skipped.` : "") +
            failNote +
            (failed.length > 0 ? " Re-run Full Sync to retry failed days (duplicates are skipped)." : "")
        );
        const dashRes = await fetch("/api/dashboard?days=30");
        setData(await dashRes.json());
      });
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading || !data) {
    return <p className="text-slate-500">Loading dashboard...</p>;
  }

  const { summary, dailyTrend, paymentMethodSplit } = data;
  const maxCollected = Math.max(...dailyTrend.map((d) => d.collected), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Last 30 days overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadDashboard}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => syncEmails(false)} disabled={syncing}>
            <Mail className="h-4 w-4" />
            {syncing ? "Syncing..." : "Sync Recent"}
          </Button>
          <Button variant="secondary" onClick={() => syncEmails(true)} disabled={syncing}>
            <Mail className="h-4 w-4" />
            {syncing ? "Syncing..." : "Full Sync (30 days)"}
          </Button>
        </div>
      </div>

      {syncResult && (
        <p className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {syncResult}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Collection"
          value={formatCurrency(summary.todayCollected)}
          icon={IndianRupee}
          color="bg-emerald-500"
        />
        <StatCard
          title="Total Bookings"
          value={String(summary.totalBookings)}
          icon={CalendarCheck}
          color="bg-blue-500"
        />
        <StatCard
          title="Pending Payments"
          value={String(summary.pendingPayments)}
          icon={AlertCircle}
          color="bg-amber-500"
        />
        <StatCard
          title="Pending Verifications"
          value={String(summary.pendingVerifications)}
          icon={TrendingUp}
          color="bg-purple-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Collection Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-1">
              {dailyTrend.slice(-14).map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-emerald-500 transition-all"
                    style={{
                      height: `${(day.collected / maxCollected) * 100}%`,
                      minHeight: day.collected > 0 ? "4px" : "0",
                    }}
                    title={formatCurrency(day.collected)}
                  />
                  <span className="text-[10px] text-slate-400">{day.label.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Split</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethodSplit.map((item) => {
              const total = summary.totalCollected || 1;
              const pct = Math.round((item.amount / total) * 100);
              return (
                <div key={item.method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{item.method}</span>
                    <span className="font-medium">
                      {formatCurrency(item.amount)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${item.method === "Cash" ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t pt-3">
              <div className="flex justify-between font-semibold">
                <span>Total Collected</span>
                <span>{formatCurrency(summary.totalCollected)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-emerald-600">
              {summary.completedBookings}
            </p>
            <p className="text-sm text-slate-500">Completed Bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-emerald-600">
              {formatCurrency(summary.cashCollected)}
            </p>
            <p className="text-sm text-slate-500">Cash Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-bold text-blue-600">
              {formatCurrency(summary.onlineCollected)}
            </p>
            <p className="text-sm text-slate-500">Online Collected</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
