"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Upload,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchStatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useLoading } from "@/components/loading-provider";

interface StatementSummary {
  id: string;
  fileName: string;
  fileUrl: string;
  statementDate: string | null;
  createdAt: string;
  uploadedBy: { name: string };
  transactionCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

interface StatementTransaction {
  id: string;
  transactionDate: string | null;
  description: string;
  amount: number;
  senderName: string | null;
  matchStatus: string;
  matchedPayment: {
    id: string;
    amount: number;
    bookingId: string;
    customerName: string;
  } | null;
}

interface StatementDetail extends StatementSummary {
  transactions: StatementTransaction[];
}

function StatementCard({
  statement,
  onUpdated,
}: {
  statement: StatementSummary;
  onUpdated: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState("");
  const { run } = useLoading();

  async function loadDetail() {
    setLoadingDetail(true);
    try {
      await run(async () => {
        const res = await fetch(`/api/bank-statements/${statement.id}`);
        if (res.ok) {
          setDetail(await res.json());
        }
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    setRematchResult("");
    if (next && !detail) {
      await loadDetail();
    }
  }

  async function handleRematch() {
    setRematching(true);
    setRematchResult("");
    try {
      const res = await fetch(`/api/bank-statements/${statement.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setRematchResult(
          data.matched > 0
            ? `Matched ${data.matched} more payment${data.matched === 1 ? "" : "s"}.`
            : "No new matches found."
        );
        await loadDetail();
        await onUpdated();
      } else {
        setRematchResult(data.error || "Re-match failed");
      }
    } finally {
      setRematching(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <FileText className="mt-0.5 h-8 w-8 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="font-medium">{statement.fileName}</p>
              <p className="text-sm text-slate-500">
                {statement.transactionCount} transactions ·{" "}
                <span className="text-emerald-700">
                  {statement.matchedCount} matched
                </span>
                {statement.unmatchedCount > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-amber-700">
                      {statement.unmatchedCount} unmatched
                    </span>
                  </>
                )}
              </p>
              <p className="text-sm text-slate-500">
                Uploaded {formatDate(statement.createdAt)} by{" "}
                {statement.uploadedBy.name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={statement.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View file
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleExpanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Transactions
                </>
              )}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700">
                Credit transactions
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rematching || statement.unmatchedCount === 0}
                onClick={handleRematch}
              >
                {rematching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Matching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Re-run matching
                  </>
                )}
              </Button>
            </div>

            {rematchResult && (
              <p className="mb-3 text-sm text-blue-700">{rematchResult}</p>
            )}

            {loadingDetail ? (
              <p className="text-sm text-slate-500">Loading transactions...</p>
            ) : !detail || detail.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No transactions found.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">
                        Date
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">
                        Description
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">
                        Matched to
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.transactions.map((txn) => (
                      <tr key={txn.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {txn.transactionDate
                            ? formatDate(txn.transactionDate)
                            : "—"}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-slate-900">
                          <p className="truncate" title={txn.description}>
                            {txn.description}
                          </p>
                          {txn.senderName && (
                            <p className="truncate text-xs text-slate-500">
                              Sender: {txn.senderName}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {matchStatusBadge(txn.matchStatus)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {txn.matchedPayment ? (
                            <Link
                              href={`/admin/bookings/${txn.matchedPayment.bookingId}`}
                              className="text-blue-600 hover:underline"
                            >
                              {txn.matchedPayment.customerName} (
                              {formatCurrency(txn.matchedPayment.amount)})
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatementsClient() {
  const [statements, setStatements] = useState<StatementSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [statementDate, setStatementDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const { run } = useLoading();

  async function loadStatements() {
    await run(async () => {
      const res = await fetch("/api/bank-statements");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setStatements(data);
      }
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult("");

    try {
      await run(async () => {
        const formData = new FormData();
        formData.append("file", file);
        if (statementDate) formData.append("statementDate", statementDate);

        const res = await fetch("/api/bank-statements", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (res.ok) {
          setResult(
            `Uploaded! Parsed ${data.transactionsParsed} transactions, auto-matched ${data.autoMatched} payments.`
          );
          setFile(null);
          setStatementDate("");
          await loadStatements();
        } else {
          setResult(data.error || "Upload failed");
        }
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatements();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bank Statements</h1>
        <p className="text-sm text-slate-500">
          Upload daily CSV bank statements to auto-match online payments
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">CSV File</label>
              <Input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                CSV should have columns for date, description/narration, and credit amount
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Statement Date (optional)
              </label>
              <Input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
              />
            </div>
            {result && (
              <p className="text-sm text-blue-700">{result}</p>
            )}
            <Button type="submit" disabled={loading || !file}>
              <Upload className="h-4 w-4" />
              {loading ? "Uploading..." : "Upload & Match"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-slate-900">Previous Uploads</h2>
        {statements.length === 0 ? (
          <p className="text-sm text-slate-500">No statements uploaded yet.</p>
        ) : (
          statements.map((s) => (
            <StatementCard
              key={s.id}
              statement={s}
              onUpdated={loadStatements}
            />
          ))
        )}
      </div>
    </div>
  );
}
