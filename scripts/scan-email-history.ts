import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import {
  isKhelomoreBookingEmail,
  matchesVenueFilter,
  parseBookingId,
  khelomoreChangeEmailSubjectQuery,
  parseKhelomoreCancelledBookings,
  parseKhelomoreEmails,
} from "../src/lib/email-parser";

const TOTAL_DAYS = 1460; // 4 years
const BATCH_DAYS = 14;

type ProjectedBooking = {
  key: string;
  externalId: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  turfName: string | null;
  customerName: string;
  totalAmount: number;
  source: "booking-email";
};

type ProjectedCancellation = {
  key: string;
  externalId: string | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  turfName: string | null;
  customerName: string;
};

function formatGmailDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function bookingKey(parts: {
  externalId?: string | null;
  bookingDate: Date;
  startTime?: string | null;
  turfName?: string | null;
}) {
  const date = parts.bookingDate.toISOString().slice(0, 10);
  const ext = parts.externalId?.split("#")[0] ?? "unknown";
  const start = parts.startTime ?? "";
  const turf = (parts.turfName ?? "").toLowerCase();
  return `${ext}|${date}|${start}|${turf}`;
}

function projectedFromParsed(
  parsed: {
    externalId?: string;
    bookingDate: Date;
    startTime?: string;
    endTime?: string;
    turfName?: string;
    customerName: string;
    totalAmount: number;
  },
  source: "booking-email"
): ProjectedBooking {
  return {
    key: bookingKey(parsed),
    externalId: parsed.externalId ?? null,
    bookingDate: parsed.bookingDate.toISOString().slice(0, 10),
    startTime: parsed.startTime ?? null,
    endTime: parsed.endTime ?? null,
    turfName: parsed.turfName ?? null,
    customerName: parsed.customerName,
    totalAmount: parsed.totalAmount,
    source,
  };
}

async function searchUids(
  client: ImapFlow,
  since: Date,
  before: Date | undefined,
  venue: string
) {
  let query =
    `from:info@khelomore.com (subject:"You have a new booking from KheloMore" OR ${khelomoreChangeEmailSubjectQuery()})`;
  if (venue) query += ` "${venue}"`;
  query += ` after:${formatGmailDate(since)}`;
  if (before) query += ` before:${formatGmailDate(before)}`;
  return (await client.search({ gmailraw: query }, { uid: true })) || [];
}

async function main() {
  const host = process.env.EMAIL_IMAP_HOST;
  const user = process.env.EMAIL_IMAP_USER;
  const pass = process.env.EMAIL_IMAP_PASSWORD;
  const venue = process.env.KHELOMORE_VENUE_NAME?.trim() ?? "";

  if (!host || !user || !pass) {
    throw new Error("Email IMAP not configured");
  }
  if (!venue) {
    throw new Error("KHELOMORE_VENUE_NAME not set");
  }

  const prisma = new PrismaClient();

  const dbBookings = await prisma.booking.findMany({
    where: { emailMessageId: { not: { startsWith: "manual:" } } },
    select: {
      id: true,
      externalId: true,
      bookingDate: true,
      startTime: true,
      endTime: true,
      turfName: true,
      customerName: true,
      totalAmount: true,
      emailMessageId: true,
    },
  });

  const manualCount = await prisma.booking.count({
    where: { emailMessageId: { startsWith: "manual:" } },
  });

  const dbByKey = new Map<
    string,
    (typeof dbBookings)[number]
  >();
  for (const b of dbBookings) {
    dbByKey.set(
      bookingKey({
        externalId: b.externalId,
        bookingDate: b.bookingDate,
        startTime: b.startTime,
        turfName: b.turfName,
      }),
      b
    );
  }

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.EMAIL_IMAP_PORT || "993", 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const projectedBookings = new Map<string, ProjectedBooking>();
  const projectedCancellations = new Map<string, ProjectedCancellation>();
  const parseFailures: string[] = [];
  const turfCounts = new Map<string, number>();
  let totalUids = 0;
  let bookingEmails = 0;
  let cancellationEmails = 0;
  let skippedVenue = 0;
  let multiDayEmails = 0;

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
      const fromDays = start;
      const toDays = Math.max(0, start - BATCH_DAYS);

      const since = new Date();
      since.setDate(since.getDate() - fromDays);
      since.setHours(0, 0, 0, 0);

      const before = new Date();
      before.setDate(before.getDate() - toDays);
      before.setHours(0, 0, 0, 0);

      const uids = await searchUids(
        client,
        since,
        toDays > 0 ? before : undefined,
        venue
      );
      totalUids += uids.length;

      process.stdout.write(
        `\nBatch ${toDays}-${fromDays}d: ${uids.length} emails...`
      );

      if (uids.length === 0) continue;

      for await (const message of client.fetch(
        uids,
        { source: true, envelope: true },
        { uid: true }
      )) {
        const from = message.envelope?.from?.[0]?.address || "";
        const subject = message.envelope?.subject || "";
        if (!isKhelomoreBookingEmail(from, subject)) continue;

        const parsedEmail = await simpleParser(message.source!);
        const body = parsedEmail.html || parsedEmail.text || "";
        const externalId = parseBookingId(subject, body);

        const cancelled = parseKhelomoreCancelledBookings(subject, body);
        if (cancelled !== null) {
          cancellationEmails++;
          if (cancelled.length === 0 && externalId) {
            // Full booking cancel — mark all keys under this id as cancelled
            projectedCancellations.set(`FULL|${externalId}`, {
              key: `FULL|${externalId}`,
              externalId,
              bookingDate: "*",
              startTime: null,
              endTime: null,
              turfName: null,
              customerName: "",
            });
          } else {
            for (const c of cancelled) {
              if (!matchesVenueFilter(c)) {
                skippedVenue++;
                continue;
              }
              const proj: ProjectedCancellation = {
                key: bookingKey(c),
                externalId: c.externalId ?? null,
                bookingDate: c.bookingDate.toISOString().slice(0, 10),
                startTime: c.startTime ?? null,
                endTime: c.endTime ?? null,
                turfName: c.turfName ?? null,
                customerName: c.customerName,
              };
              projectedCancellations.set(proj.key, proj);
            }
          }
          continue;
        }

        const entries = parseKhelomoreEmails(subject, body);
        if (entries.length === 0) {
          parseFailures.push(subject.slice(0, 80));
          continue;
        }

        bookingEmails++;
        if (entries.length > 1) multiDayEmails++;

        for (const entry of entries) {
          if (!matchesVenueFilter(entry)) {
            skippedVenue++;
            continue;
          }
          const proj = projectedFromParsed(entry, "booking-email");
          projectedBookings.set(proj.key, proj);
          const turf = proj.turfName ?? "(none)";
          turfCounts.set(turf, (turfCounts.get(turf) ?? 0) + 1);
        }
      }
    }
  } finally {
    lock.release();
    await client.logout();
    await prisma.$disconnect();
  }

  const projectedList = [...projectedBookings.values()];
  const cancelledKeys = new Set(projectedCancellations.keys());
  const fullCancelIds = [...projectedCancellations.values()]
    .filter((c) => c.bookingDate === "*")
    .map((c) => c.externalId)
    .filter(Boolean) as string[];

  const activeProjected = projectedList.filter((p) => {
    if (p.externalId && fullCancelIds.some((id) => p.externalId!.startsWith(id))) {
      return false;
    }
    if (cancelledKeys.has(p.key)) return false;
    if (
      p.externalId &&
      projectedCancellations.has(`FULL|${p.externalId.split("#")[0]}`)
    ) {
      return false;
    }
    return true;
  });

  const activeKeys = new Set(activeProjected.map((p) => p.key));
  const dbKeys = new Set(dbByKey.keys());

  const missingInDb = activeProjected.filter((p) => !dbKeys.has(p.key));
  const extraInDb = dbBookings.filter((b) => {
    const key = bookingKey({
      externalId: b.externalId,
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      turfName: b.turfName,
    });
    return !activeKeys.has(key);
  });

  const mismatches: Array<{
    key: string;
    field: string;
    db: string;
    scan: string;
  }> = [];

  for (const p of activeProjected) {
    const db = dbByKey.get(p.key);
    if (!db) continue;
    const dbAmount = Number(db.totalAmount);
    if (Math.abs(dbAmount - p.totalAmount) > 1) {
      mismatches.push({
        key: p.key,
        field: "totalAmount",
        db: String(dbAmount),
        scan: String(p.totalAmount),
      });
    }
    if ((db.turfName ?? "") !== (p.turfName ?? "")) {
      mismatches.push({
        key: p.key,
        field: "turfName",
        db: db.turfName ?? "",
        scan: p.turfName ?? "",
      });
    }
    if ((db.startTime ?? "") !== (p.startTime ?? "")) {
      mismatches.push({
        key: p.key,
        field: "startTime",
        db: db.startTime ?? "",
        scan: p.startTime ?? "",
      });
    }
  }

  const cancelledStillInDb = activeProjected.length
    ? dbBookings.filter((b) => {
        const key = bookingKey({
          externalId: b.externalId,
          bookingDate: b.bookingDate,
          startTime: b.startTime,
          turfName: b.turfName,
        });
        return projectedCancellations.has(key) && dbKeys.has(key);
      })
    : [];

  // Also: DB rows that match a cancellation key
  const dbShouldBeRemoved = dbBookings.filter((b) => {
    const key = bookingKey({
      externalId: b.externalId,
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      turfName: b.turfName,
    });
    if (projectedCancellations.has(key)) return true;
    const base = b.externalId?.split("#")[0];
    return base ? projectedCancellations.has(`FULL|${base}`) : false;
  });

  console.log("\n\n========== SCAN REPORT (READ-ONLY) ==========\n");
  console.log("Config");
  console.log(`  Gmail: ${user}`);
  console.log(`  Venue filter: ${venue}`);
  console.log(`  Scan window: ${TOTAL_DAYS} days (~4 years)`);

  console.log("\nGmail");
  console.log(`  Total emails fetched: ${totalUids}`);
  console.log(`  Booking emails parsed: ${bookingEmails}`);
  console.log(`  Cancellation emails: ${cancellationEmails}`);
  console.log(`  Multi-day booking emails: ${multiDayEmails}`);
  console.log(`  Parse failures: ${parseFailures.length}`);
  console.log(`  Skipped (venue/turf filter): ${skippedVenue}`);

  console.log("\nProjected from emails");
  console.log(`  Total booking rows parsed: ${projectedList.length}`);
  console.log(`  After applying cancellations: ${activeProjected.length}`);
  console.log(`  Cancellation targets: ${projectedCancellations.size}`);

  console.log("\nTurf breakdown (projected active)");
  for (const [turf, count] of [...turfCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${turf}: ${count}`);
  }

  console.log("\nDatabase today");
  console.log(`  Email-sourced bookings: ${dbBookings.length}`);
  console.log(`  Manual bookings: ${manualCount}`);

  console.log("\nComparison (scan vs DB)");
  console.log(`  Would exist after reimport: ${activeProjected.length}`);
  console.log(`  Missing in DB (under-imported): ${missingInDb.length}`);
  console.log(`  Extra in DB (not in scan): ${extraInDb.length}`);
  console.log(`  Field mismatches (same key): ${mismatches.length}`);
  console.log(`  Cancelled but still in DB: ${dbShouldBeRemoved.length}`);

  console.log("\nEstimated full reimport");
  console.log(`  Would delete ~${dbBookings.length} email bookings`);
  console.log(`  Would create ~${activeProjected.length} bookings`);
  console.log(`  Net change: ${activeProjected.length - dbBookings.length >= 0 ? "+" : ""}${activeProjected.length - dbBookings.length}`);
  console.log(`  Prisma ops (estimate): ~${Math.round(dbBookings.length * 0.01) + activeProjected.length * 2 + projectedCancellations.size * 2 + 5000}`);

  if (parseFailures.length > 0) {
    console.log("\nSample parse failures:");
    for (const s of parseFailures.slice(0, 8)) {
      console.log(`  - ${s}`);
    }
  }

  if (missingInDb.length > 0) {
    console.log("\nSample missing in DB:");
    for (const p of missingInDb.slice(0, 8)) {
      console.log(
        `  - ${p.externalId} | ${p.bookingDate} | ${p.startTime}-${p.endTime} | ${p.turfName} | ${p.customerName}`
      );
    }
  }

  if (extraInDb.length > 0) {
    console.log("\nSample extra in DB (not in scan):");
    for (const b of extraInDb.slice(0, 8)) {
      console.log(
        `  - ${b.externalId} | ${b.bookingDate.toISOString().slice(0, 10)} | ${b.startTime}-${b.endTime} | ${b.turfName} | ${b.customerName}`
      );
    }
  }

  if (mismatches.length > 0) {
    console.log("\nSample mismatches:");
    for (const m of mismatches.slice(0, 8)) {
      console.log(`  - ${m.key} | ${m.field}: DB=${m.db} vs scan=${m.scan}`);
    }
  }

  if (dbShouldBeRemoved.length > 0) {
    console.log("\nSample cancelled but still in DB:");
    for (const b of dbShouldBeRemoved.slice(0, 8)) {
      console.log(
        `  - ${b.externalId} | ${b.bookingDate.toISOString().slice(0, 10)} | ${b.startTime}-${b.endTime} | ${b.turfName} | ${b.customerName}`
      );
    }
  }

  console.log("\n============================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
