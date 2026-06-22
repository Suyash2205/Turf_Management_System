import { google } from "googleapis";
import { prisma } from "@/lib/db";

type Row = Record<string, unknown>;

const TAB_ORDER = [
  "Users",
  "Bookings",
  "Payments",
  "BookingAdjustments",
  "BankStatements",
  "BankTransactions",
  "AuditLogs",
  "EmailSyncLogs",
] as const;

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildRows(records: Row[]) {
  const columns = Array.from(
    new Set(records.flatMap((record) => Object.keys(record)))
  ).sort();

  const values: string[][] = [
    columns,
    ...records.map((record) =>
      columns.map((column) => normalizeCell(record[column]))
    ),
  ];

  return { columns, values };
}

async function ensureSheetsExist(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  titles: readonly string[]
) {
  const info = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const existing = new Set(
    info.data.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title): title is string => !!title) ?? []
  );

  const missing = titles.filter((title) => !existing.has(title));
  if (missing.length === 0) return;

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map((title) => ({
        addSheet: { properties: { title } },
      })),
    },
  });
}

async function writeSheet(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  records: Row[]
) {
  const { values } = buildRows(records);
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId,
    range: `${title}!A:ZZ`,
  });
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function syncDatabaseToGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Sheets env vars: GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY"
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheetsApi = google.sheets({ version: "v4", auth });

  await ensureSheetsExist(sheetsApi, spreadsheetId, TAB_ORDER);

  const [
    users,
    bookings,
    payments,
    adjustments,
    statements,
    transactions,
    auditLogs,
    emailSyncLogs,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.booking.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.bookingAdjustment.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.bankStatement.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.bankTransaction.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.emailSyncLog.findMany({ orderBy: { syncedAt: "desc" } }),
  ]);

  await Promise.all([
    writeSheet(sheetsApi, spreadsheetId, "Users", users),
    writeSheet(sheetsApi, spreadsheetId, "Bookings", bookings),
    writeSheet(sheetsApi, spreadsheetId, "Payments", payments),
    writeSheet(sheetsApi, spreadsheetId, "BookingAdjustments", adjustments),
    writeSheet(sheetsApi, spreadsheetId, "BankStatements", statements),
    writeSheet(sheetsApi, spreadsheetId, "BankTransactions", transactions),
    writeSheet(sheetsApi, spreadsheetId, "AuditLogs", auditLogs),
    writeSheet(sheetsApi, spreadsheetId, "EmailSyncLogs", emailSyncLogs),
  ]);

  const metaValues = [
    ["lastSyncedAt", new Date().toISOString()],
    ["timezone", "UTC"],
  ];
  await ensureSheetsExist(sheetsApi, spreadsheetId, ["SyncMeta"]);
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId,
    range: "SyncMeta!A:B",
  });
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: "SyncMeta!A1",
    valueInputOption: "RAW",
    requestBody: { values: metaValues },
  });

  return {
    spreadsheetId,
    counts: {
      users: users.length,
      bookings: bookings.length,
      payments: payments.length,
      adjustments: adjustments.length,
      statements: statements.length,
      transactions: transactions.length,
      auditLogs: auditLogs.length,
      emailSyncLogs: emailSyncLogs.length,
    },
  };
}
