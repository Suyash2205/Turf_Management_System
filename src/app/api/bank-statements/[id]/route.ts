import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchBankTransactions } from "@/lib/bank-matcher";
import { toNumber } from "@/lib/bookings";
import { MatchStatus, type Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

type StatementTransactionRecord = Prisma.BankTransactionGetPayload<{
  include: {
    matchedPayment: {
      include: {
        booking: { select: { id: true; customerName: true } };
      };
    };
  };
}>;

function serializeTransaction(txn: StatementTransactionRecord) {
  return {
    id: txn.id,
    transactionDate: txn.transactionDate?.toISOString() ?? null,
    description: txn.description,
    amount: toNumber(txn.amount),
    senderName: txn.senderName,
    matchStatus: txn.matchStatus,
    matchedPayment: txn.matchedPayment
      ? {
          id: txn.matchedPayment.id,
          amount: toNumber(txn.matchedPayment.amount),
          bookingId: txn.matchedPayment.booking.id,
          customerName: txn.matchedPayment.booking.customerName,
        }
      : null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const statement = await prisma.bankStatement.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { name: true } },
      transactions: {
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
        include: {
          matchedPayment: {
            include: {
              booking: { select: { id: true, customerName: true } },
            },
          },
        },
      },
    },
  });

  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const transactions = statement.transactions.map(serializeTransaction);
  const matchedCount = transactions.filter(
    (t) => t.matchStatus === MatchStatus.MATCHED
  ).length;

  return NextResponse.json({
    id: statement.id,
    fileName: statement.fileName,
    fileUrl: statement.fileUrl,
    statementDate: statement.statementDate?.toISOString() ?? null,
    createdAt: statement.createdAt.toISOString(),
    uploadedBy: statement.uploadedBy,
    transactionCount: transactions.length,
    matchedCount,
    unmatchedCount: transactions.length - matchedCount,
    transactions,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const statement = await prisma.bankStatement.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const matched = await matchBankTransactions(id, {
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorName: session.user.name,
    actorRole: session.user.role,
  });

  return NextResponse.json({ matched });
}
