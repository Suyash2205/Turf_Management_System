import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { amountsMatch, namesMatch } from "@/lib/ocr";
import { MatchStatus, VerificationStatus } from "@/generated/prisma/client";
import { toNumber } from "@/lib/bookings";

export interface ParsedBankRow {
  transactionDate: Date | null;
  description: string;
  amount: number;
  senderName: string | null;
}

function parseCsvDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function extractSenderFromDescription(desc: string): string | null {
  const upiMatch = desc.match(/([a-z0-9._-]+@[a-z]+)/i);
  if (upiMatch) return upiMatch[1];

  const nameMatch = desc.match(
    /(?:UPI|NEFT|IMPS|RTGS|FROM|BY)\s*[/-]?\s*([A-Za-z][A-Za-z\s.]{2,40})/i
  );
  return nameMatch ? nameMatch[1].trim() : null;
}

export function parseBankStatementCsv(content: string): ParsedBankRow[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: ParsedBankRow[] = [];

  for (const row of result.data) {
    const keys = Object.keys(row);
    const dateKey = keys.find((k) =>
      /date|txn.?date|transaction.?date/i.test(k)
    );
    const descKey = keys.find((k) =>
      /description|narration|particulars|details|remark/i.test(k)
    );
    const creditKey = keys.find((k) => /credit|deposit|cr/i.test(k));
    const debitKey = keys.find((k) => /debit|withdrawal|dr/i.test(k));
    const amountKey = keys.find((k) =>
      /^amount$|transaction.?amount/i.test(k)
    );

    const description =
      (descKey && row[descKey]) ||
      Object.values(row).find((v) => v && v.length > 10) ||
      "";

    let amount = 0;
    if (creditKey && row[creditKey]) {
      amount = parseFloat(String(row[creditKey]).replace(/,/g, "")) || 0;
    } else if (amountKey && row[amountKey]) {
      amount = parseFloat(String(row[amountKey]).replace(/,/g, "")) || 0;
    }

    if (amount <= 0 && debitKey && row[debitKey]) continue;
    if (amount <= 0) continue;

    rows.push({
      transactionDate: dateKey ? parseCsvDate(row[dateKey]) : null,
      description: String(description),
      amount,
      senderName: extractSenderFromDescription(String(description)),
    });
  }

  return rows;
}

export async function matchBankTransactions(statementId: string) {
  const transactions = await prisma.bankTransaction.findMany({
    where: { statementId, matchStatus: MatchStatus.UNMATCHED },
  });

  const pendingPayments = await prisma.payment.findMany({
    where: {
      method: "ONLINE",
      verificationStatus: VerificationStatus.PENDING,
      bankTransaction: { is: null },
    },
    include: { booking: true, bankTransaction: true },
  });

  let matched = 0;

  for (const txn of transactions) {
    const txnAmount = toNumber(txn.amount);

    for (const payment of pendingPayments) {
      if (payment.bankTransaction) continue;

      const photoAmount = payment.extractedAmount
        ? toNumber(payment.extractedAmount)
        : toNumber(payment.amount);
      const photoName = payment.extractedSenderName;

      const amountOk =
        amountsMatch(txnAmount, photoAmount) ||
        amountsMatch(txnAmount, toNumber(payment.amount));
      const nameOk =
        namesMatch(txn.senderName, photoName) ||
        namesMatch(txn.description, photoName || "");

      if (amountOk && (nameOk || !photoName)) {
        await prisma.$transaction([
          prisma.bankTransaction.update({
            where: { id: txn.id },
            data: {
              matchStatus: MatchStatus.MATCHED,
              matchedPaymentId: payment.id,
            },
          }),
          prisma.payment.update({
            where: { id: payment.id },
            data: {
              verificationStatus: VerificationStatus.VERIFIED,
              verifiedAt: new Date(),
            },
          }),
        ]);
        matched++;
        break;
      }
    }
  }

  return matched;
}
