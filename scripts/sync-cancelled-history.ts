import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../src/lib/db";
import {
  khelomoreChangeEmailSubjectQuery,
  parseBookingId,
  parseKhelomoreModificationBookings,
} from "../src/lib/email-parser";
import { applyKhelomoreBookingChanges } from "../src/lib/cancelled-bookings";
import { recalculateBookingStatus } from "../src/lib/bookings";

const TOTAL_DAYS = parseInt(process.env.CANCEL_SWEEP_DAYS || "60", 10);
const BATCH_DAYS = 14;
const MAX_RETRIES = 3;
const LARGE_SWEEP_DAYS = 90;
const ENABLE_AUDIT_LOGS = process.env.CANCEL_SWEEP_AUDIT_LOGS === "true";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatGmailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

async function processBatch(since: Date, before?: Date) {
  const host = process.env.EMAIL_IMAP_HOST!;
  const user = process.env.EMAIL_IMAP_USER!;
  const pass = process.env.EMAIL_IMAP_PASSWORD!;

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.EMAIL_IMAP_PORT || "993", 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let cancelledEmails = 0;
  let removed = 0;
  let updated = 0;
  const updatedBookingIds = new Set<string>();

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    let query = `from:info@khelomore.com ${khelomoreChangeEmailSubjectQuery()}`;
    const venue = process.env.KHELOMORE_VENUE_NAME?.trim();
    if (venue) query += ` "${venue}"`;
    query += ` after:${formatGmailDate(since)}`;
    if (before) query += ` before:${formatGmailDate(before)}`;

    const uids = await client.search({ gmailraw: query }, { uid: true });
    if (!uids.length) return { cancelledEmails, removed, updated };

    let processed = 0;
    for await (const message of client.fetch(uids, { source: true }, { uid: true })) {
      processed++;
      if (processed % 25 === 0) {
        process.stdout.write(".");
      }

      const parsed = await simpleParser(message.source!);
      const subject = parsed.subject || "";
      const body = parsed.html || parsed.text || "";
      const modification = parseKhelomoreModificationBookings(subject, body);
      if (modification === null) continue;

      cancelledEmails++;
      const externalId = parseBookingId(subject, body);
      const result = await applyKhelomoreBookingChanges(
        externalId,
        modification,
        {
          emailSubject: subject,
          source: "cancelled-history-script",
          disableAudit: !ENABLE_AUDIT_LOGS,
        }
      );
      removed += result.removed;
      updated += result.updated;
      for (const id of result.updatedBookingIds) {
        updatedBookingIds.add(id);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return {
    cancelledEmails,
    removed,
    updated,
    updatedBookingIds: [...updatedBookingIds],
  };
}

async function processBatchWithRetry(since: Date, before?: Date) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await processBatch(since, before);
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      const delay = attempt * 5000;
      console.log(`\n  retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
  return { cancelledEmails: 0, removed: 0, updated: 0, updatedBookingIds: [] };
}

async function main() {
  if (TOTAL_DAYS > LARGE_SWEEP_DAYS && process.env.ALLOW_LARGE_CANCEL_SWEEP !== "true") {
    throw new Error(
      `Refusing expensive sweep: CANCEL_SWEEP_DAYS=${TOTAL_DAYS}. Set ALLOW_LARGE_CANCEL_SWEEP=true to override.`
    );
  }

  let totalCancelledEmails = 0;
  let totalRemoved = 0;
  let totalUpdated = 0;
  const updatedBookingIds = new Set<string>();

  const beforeCount = await prisma.booking.count({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });
  console.log(`Email bookings before sweep: ${beforeCount}`);
  console.log(`Scanning ${TOTAL_DAYS} days of cancellation emails...`);

  for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(0, start - BATCH_DAYS);

    const since = new Date();
    since.setDate(since.getDate() - fromDays);
    since.setHours(0, 0, 0, 0);

    const before = new Date();
    before.setDate(before.getDate() - toDays);
    before.setHours(0, 0, 0, 0);

    process.stdout.write(`Batch days ${toDays}-${fromDays}... `);
    const result = await processBatchWithRetry(
      since,
      toDays > 0 ? before : undefined
    );
    totalCancelledEmails += result.cancelledEmails;
    totalRemoved += result.removed;
    totalUpdated += result.updated;
    for (const id of result.updatedBookingIds) {
      updatedBookingIds.add(id);
    }
    console.log(
      `${result.cancelledEmails} modification emails, ${result.removed} removed, ${result.updated} updated`
    );
  }

  const afterCount = await prisma.booking.count({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });

  await prisma.emailSyncLog.create({
    data: {
      emailsFound: totalCancelledEmails,
      bookingsCreated: 0,
      errors: `Cancelled-history sweep (${TOTAL_DAYS}d): ${totalCancelledEmails} emails, removed ${totalRemoved}, updated ${totalUpdated}, ${beforeCount} -> ${afterCount} email bookings`,
    },
  });

  console.log("\n=== Cancellation sweep complete ===");
  console.log(`Cancellation emails processed: ${totalCancelledEmails}`);
  console.log(`Bookings removed: ${totalRemoved}`);
  console.log(`Bookings updated (duration trimmed): ${totalUpdated}`);
  console.log(`Email bookings: ${beforeCount} -> ${afterCount}`);

  if (updatedBookingIds.size > 0) {
    console.log("\nRecalculating payment statuses for updated bookings...");
    for (const id of updatedBookingIds) {
      await recalculateBookingStatus(id);
    }
    console.log(`Recalculated ${updatedBookingIds.size} bookings`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
