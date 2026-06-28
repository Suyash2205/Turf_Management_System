import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../src/lib/db";
import {
  khelomoreChangeEmailSubjectQuery,
  parseBookingId,
  parseKhelomoreCancelledBookings,
} from "../src/lib/email-parser";
import { removeCancelledBookings } from "../src/lib/cancelled-bookings";

const TOTAL_DAYS = 730;
const BATCH_DAYS = 14;

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

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    let query = `from:info@khelomore.com ${khelomoreChangeEmailSubjectQuery()}`;
    const venue = process.env.KHELOMORE_VENUE_NAME?.trim();
    if (venue) query += ` "${venue}"`;
    query += ` after:${formatGmailDate(since)}`;
    if (before) query += ` before:${formatGmailDate(before)}`;

    const uids = await client.search({ gmailraw: query }, { uid: true });
    if (!uids.length) return { cancelledEmails, removed };

    let processed = 0;
    for await (const message of client.fetch(uids, { source: true }, { uid: true })) {
      processed++;
      if (processed % 25 === 0) {
        process.stdout.write(".");
      }

      const parsed = await simpleParser(message.source!);
      const subject = parsed.subject || "";
      const body = parsed.html || parsed.text || "";
      const cancelledBookings = parseKhelomoreCancelledBookings(subject, body);
      if (cancelledBookings === null) continue;

      cancelledEmails++;
      const externalId = parseBookingId(subject, body);
      removed += await removeCancelledBookings(externalId, cancelledBookings, {
        emailSubject: subject,
        source: "cancelled-history-script",
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return { cancelledEmails, removed };
}

async function main() {
  let totalCancelledEmails = 0;
  let totalRemoved = 0;

  console.log("Scanning 2 years of cancellation emails...");

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
    const result = await processBatch(since, toDays > 0 ? before : undefined);
    totalCancelledEmails += result.cancelledEmails;
    totalRemoved += result.removed;
    console.log(
      `${result.cancelledEmails} cancellation emails, ${result.removed} bookings removed`
    );
  }

  console.log("\n=== Cancellation sweep complete ===");
  console.log(`Cancellation emails processed: ${totalCancelledEmails}`);
  console.log(`Bookings removed: ${totalRemoved}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
