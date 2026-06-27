import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseBankStatementCsv, matchBankTransactions } from "@/lib/bank-matcher";
import { logAudit } from "@/lib/audit-log";
import { MatchStatus } from "@prisma/client";

function serializeStatementList(
  statement: {
    id: string;
    fileName: string;
    fileUrl: string;
    statementDate: Date | null;
    createdAt: Date;
    uploadedBy: { name: string };
    transactions: { matchStatus: MatchStatus }[];
  }
) {
  const matchedCount = statement.transactions.filter(
    (t) => t.matchStatus === MatchStatus.MATCHED
  ).length;

  return {
    id: statement.id,
    fileName: statement.fileName,
    fileUrl: statement.fileUrl,
    statementDate: statement.statementDate?.toISOString() ?? null,
    createdAt: statement.createdAt.toISOString(),
    uploadedBy: statement.uploadedBy,
    transactionCount: statement.transactions.length,
    matchedCount,
    unmatchedCount: statement.transactions.length - matchedCount,
  };
}

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statements = await prisma.bankStatement.findMany({
    include: {
      uploadedBy: { select: { name: true } },
      transactions: { select: { matchStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(statements.map(serializeStatementList));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const statementDate = formData.get("statementDate") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const content = await file.text();
  const rows = parseBankStatementCsv(content);

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(`bank-statements/${Date.now()}-${file.name}`, buffer, {
    access: "public",
    contentType: file.type || "text/csv",
  });

  const statement = await prisma.bankStatement.create({
    data: {
      fileName: file.name,
      fileUrl: blob.url,
      statementDate: statementDate ? new Date(statementDate) : null,
      uploadedById: session.user.id,
      transactions: {
        create: rows.map((row) => ({
          transactionDate: row.transactionDate,
          description: row.description,
          amount: row.amount,
          senderName: row.senderName,
        })),
      },
    },
    include: { transactions: true },
  });

  const matched = await matchBankTransactions(statement.id, {
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorName: session.user.name,
    actorRole: session.user.role,
  });

  await logAudit({
    action: "BANK_STATEMENT_UPLOADED",
    session,
    summary: `${session.user.email} uploaded bank statement ${file.name} (${rows.length} transactions, ${matched} auto-matched)`,
    entityType: "bank_statement",
    entityId: statement.id,
    details: {
      fileName: file.name,
      transactionsParsed: rows.length,
      autoMatched: matched,
    },
    request,
  });

  return NextResponse.json({
    statement,
    transactionsParsed: rows.length,
    autoMatched: matched,
  });
}
