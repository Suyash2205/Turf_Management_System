import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import {
  isKhelomoreBookingEmail,
  matchesVenueFilter,
  parseKhelomoreEmail,
} from "../src/lib/email-parser";

const prisma = new PrismaClient();

function formatGmailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

async function gmailSearch(client: ImapFlow, query: string) {
  const uids = await client.search({ gmailraw: query }, { uid: true });
  return uids || [];
}

async function main() {
  const host = process.env.EMAIL_IMAP_HOST!;
  const user = process.env.EMAIL_IMAP_USER!;
  const pass = process.env.EMAIL_IMAP_PASSWORD!;
  const venueFilter = process.env.KHELOMORE_VENUE_NAME || "(NOT SET)";

  console.log("=== Config ===");
  console.log("IMAP user:", user);
  console.log("Venue filter:", venueFilter);
  console.log("Poll days:", process.env.EMAIL_SYNC_POLL_DAYS || "2");

  const bookingCount = await prisma.booking.count();
  const withEmailId = await prisma.booking.count({
    where: { emailMessageId: { not: null } },
  });
  console.log("\n=== Database ===");
  console.log("Total bookings:", bookingCount);
  console.log("With emailMessageId:", withEmailId);

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    const since2 = new Date();
    since2.setDate(since2.getDate() - 2);

    const queries = {
      allFromKhelomore30d: `from:info@khelomore.com after:${formatGmailDate(since30)}`,
      bookingSubject30d: `from:info@khelomore.com subject:"You have a new booking from KheloMore" after:${formatGmailDate(since30)}`,
      bookingSubject2d: `from:info@khelomore.com subject:"You have a new booking from KheloMore" after:${formatGmailDate(since2)}`,
      lushSports30d: `from:info@khelomore.com "Lush Sports" after:${formatGmailDate(since30)}`,
    };

    console.log("\n=== Gmail counts (last 30 / 2 days) ===");
    for (const [name, query] of Object.entries(queries)) {
      const uids = await gmailSearch(client, query);
      console.log(`${name}: ${uids.length}`);
    }

    const uids = await gmailSearch(client, queries.bookingSubject30d);
    const sampleUids = uids.slice(-5); // most recent 5

    console.log("\n=== Sample recent booking emails ===");
    let parseOk = 0;
    let venueMatch = 0;
    let alreadyInDb = 0;
    const venueNames = new Set<string>();
    const parseFails: string[] = [];

    for await (const message of client.fetch(
      sampleUids.length ? sampleUids : uids.slice(0, 5),
      { source: true, envelope: true },
      { uid: true }
    )) {
      const from = message.envelope?.from?.[0]?.address || "";
      const subject = message.envelope?.subject || "";
      const date = message.envelope?.date?.toISOString() || "?";

      console.log(`\n--- UID ${message.uid} | ${date} ---`);
      console.log("From:", from);
      console.log("Subject:", subject);
      console.log("Passes filter:", isKhelomoreBookingEmail(from, subject));

      const parsedEmail = await simpleParser(message.source!);
      const body = parsedEmail.html || parsedEmail.text || "";
      const messageId = parsedEmail.messageId || String(message.uid);

      const existing = await prisma.booking.findUnique({
        where: { emailMessageId: messageId },
      });
      if (existing) {
        alreadyInDb++;
        console.log("Already in DB: yes (id:", existing.id, ")");
      }

      const booking = parseKhelomoreEmail(subject, body);
      if (booking) {
        parseOk++;
        console.log("Parsed venue:", booking.venueName);
        console.log("Parsed turf:", booking.turfName);
        console.log("Parsed customer:", booking.customerName);
        console.log("Parsed date:", booking.bookingDate.toISOString());
        console.log("Parsed amount:", booking.totalAmount);
        console.log("External ID:", booking.externalId);
        if (booking.venueName) venueNames.add(booking.venueName);
        const matches = matchesVenueFilter(booking);
        if (matches) venueMatch++;
        console.log("Venue filter match:", matches);
      } else {
        parseFails.push(subject);
        console.log("Parse: FAILED");
        const text = body.replace(/<[^>]+>/g, " ").slice(0, 500);
        console.log("Body preview:", text.replace(/\s+/g, " ").slice(0, 300));
      }
    }

    // Full scan stats on all 30d booking emails (envelope only — fast)
    console.log("\n=== Full 30-day scan (envelope only) ===");
    let totalBookingEmails = 0;
    let passSubject = 0;
    const subjects = new Map<string, number>();

    for await (const message of client.fetch(
      uids,
      { envelope: true },
      { uid: true }
    )) {
      totalBookingEmails++;
      const from = message.envelope?.from?.[0]?.address || "";
      const subject = message.envelope?.subject || "";
      if (isKhelomoreBookingEmail(from, subject)) passSubject++;
      subjects.set(subject.slice(0, 60), (subjects.get(subject.slice(0, 60)) || 0) + 1);
    }

    console.log("UIDs from Gmail search:", uids.length);
    console.log("Fetched envelopes:", totalBookingEmails);
    console.log("Pass isKhelomoreBookingEmail:", passSubject);
    console.log("\nUnique subject prefixes:");
    for (const [s, c] of [...subjects.entries()].slice(0, 10)) {
      console.log(`  [${c}x] ${s}`);
    }

    console.log("\n=== Sample summary ===");
    console.log("Parse OK:", parseOk, "/", sampleUids.length || 5);
    console.log("Venue match:", venueMatch);
    console.log("Already in DB:", alreadyInDb);
    console.log("Venue names seen:", [...venueNames]);
  } finally {
    lock.release();
    await client.logout();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
