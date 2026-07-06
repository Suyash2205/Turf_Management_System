import { google } from "googleapis";
import { prisma } from "@/lib/db";
import {
  fetchMainSheetRows,
  MAIN_SHEET_TITLE,
  mainSheetValues,
} from "@/lib/google-sheets-main";

type Row = Record<string, unknown>;

const TAB_ORDER = [
  MAIN_SHEET_TITLE,
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

async function writeSheetWithValues(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  values: (string | number)[][]
) {
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

/** Read the last successful sync time from the SyncMeta tab (0 DB operations). */
async function readLastSyncedAt(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<Date | null> {
  try {
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: "SyncMeta!A:B",
    });
    const row = (res.data.values ?? []).find((r) => r[0] === "lastSyncedAt");
    if (!row?.[1]) return null;
    const date = new Date(String(row[1]));
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** Append only the given records to a tab (writes the header first if the tab is empty). */
async function appendRows(
  sheetsApi: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  records: Row[]
) {
  if (records.length === 0) return;
  const { values } = buildRows(records); // [header, ...dataRows]
  const head = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A1:A1`,
  });
  const hasHeader = !!head.data.values?.length;
  const toAppend = hasHeader ? values.slice(1) : values;
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: toAppend },
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

  // Incremental for the unbounded, append-only logs: on the first run (no watermark)
  // we baseline everything; afterwards we only fetch + append rows newer than the last
  // sync, so AuditLogs/EmailSyncLogs no longer re-read the entire (ever-growing) table.
  const since = await readLastSyncedAt(sheetsApi, spreadsheetId);
  const incremental = since != null;
  const auditWhere = incremental ? { createdAt: { gt: since } } : {};
  const syncLogWhere = incremental ? { syncedAt: { gt: since } } : {};

  const [
    mainSheetRows,
    users,
    bookings,
    payments,
    adjustments,
    statements,
    transactions,
    auditLogs,
    emailSyncLogs,
  ] = await Promise.all([
    fetchMainSheetRows(),
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
    // Ascending so appended rows stay in chronological order at the bottom of the tab.
    prisma.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "asc" } }),
    prisma.emailSyncLog.findMany({ where: syncLogWhere, orderBy: { syncedAt: "asc" } }),
  ]);

  await Promise.all([
    // Bounded tables: full rewrite (handles inserts, updates and deletes correctly).
    writeSheetWithValues(
      sheetsApi,
      spreadsheetId,
      MAIN_SHEET_TITLE,
      mainSheetValues(mainSheetRows)
    ),
    writeSheet(sheetsApi, spreadsheetId, "Users", users),
    writeSheet(sheetsApi, spreadsheetId, "Bookings", bookings),
    writeSheet(sheetsApi, spreadsheetId, "Payments", payments),
    writeSheet(sheetsApi, spreadsheetId, "BookingAdjustments", adjustments),
    writeSheet(sheetsApi, spreadsheetId, "BankStatements", statements),
    writeSheet(sheetsApi, spreadsheetId, "BankTransactions", transactions),
    // Unbounded logs: append only the new rows (baseline writes everything once).
    incremental
      ? appendRows(sheetsApi, spreadsheetId, "AuditLogs", auditLogs)
      : writeSheet(sheetsApi, spreadsheetId, "AuditLogs", auditLogs),
    incremental
      ? appendRows(sheetsApi, spreadsheetId, "EmailSyncLogs", emailSyncLogs)
      : writeSheet(sheetsApi, spreadsheetId, "EmailSyncLogs", emailSyncLogs),
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
    incremental,
    counts: {
      mainSheet: mainSheetRows.length,
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
