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

  async function loadDashboard() {
    setLoading(true);
    const res = await fetch("/api/dashboard?days=30");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  async function syncEmails(full = false) {
    setSyncing(true);
    setSyncResult("");
    const res = await fetch(
      `/api/email/sync${full ? "?full=true" : ""}`,
      { method: "POST" }
    );
    const json = await res.json();
    setSyncing(false);
    if (res.ok) {
      setSyncResult(
        `${full ? "Full sync" : "Sync"}: ${json.bookingsCreated} new bookings from ${json.emailsFound} Khelomore emails` +
          (json.emailsSkipped ? ` (${json.emailsSkipped} skipped — other venues)` : "")
      );
      loadDashboard();
    } else {
      setSyncResult(json.error || "Sync failed");
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
