"use client";

import { useEffect, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { useLoading } from "@/components/loading-provider";

interface Statement {
  id: string;
  fileName: string;
  fileUrl: string;
  statementDate: string | null;
  createdAt: string;
  uploadedBy: { name: string };
  _count: { transactions: number };
}

export function StatementsClient() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [statementDate, setStatementDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const { run } = useLoading();

  async function loadStatements() {
    await run(async () => {
      const res = await fetch("/api/bank-statements");
      const data = await res.json();
      setStatements(data);
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
          const listRes = await fetch("/api/bank-statements");
          setStatements(await listRes.json());
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
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-slate-400" />
                  <div>
                    <p className="font-medium">{s.fileName}</p>
                    <p className="text-sm text-slate-500">
                      {s._count.transactions} transactions · Uploaded{" "}
                      {formatDate(s.createdAt)} by {s.uploadedBy.name}
                    </p>
                  </div>
                </div>
                <a
                  href={s.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View file
                </a>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
