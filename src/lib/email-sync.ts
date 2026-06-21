import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import {
  isKhelomoreBookingEmail,
  matchesVenueFilter,
  parseKhelomoreEmail,
} from "@/lib/email-parser";
import { BookingPaymentStatus } from "@prisma/client";

export interface SyncOptions {
  fromDaysAgo?: number;
  toDaysAgo?: number;
}

function formatGmailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function getSyncWindow(fullSync: boolean, options?: SyncOptions) {
  if (options?.fromDaysAgo != null) {
    const since = new Date();
    since.setDate(since.getDate() - options.fromDaysAgo);
    since.setHours(0, 0, 0, 0);

    const toDays = options.toDaysAgo ?? 0;
    const before = new Date();
    before.setDate(before.getDate() - toDays);
    before.setHours(0, 0, 0, 0);

    return { since, before: toDays > 0 ? before : undefined };
  }

  const daysBack = parseInt(process.env.EMAIL_SYNC_LOOKBACK_DAYS || "30", 10);

  if (fullSync) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    return { since, before: undefined };
  }

  if (process.env.EMAIL_SYNC_MODE === "poll") {
    const pollDays = parseInt(process.env.EMAIL_SYNC_POLL_DAYS || "2", 10);
    const since = new Date();
    since.setDate(since.getDate() - pollDays);
    return { since, before: undefined };
  }

  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  return { since, before: undefined };
}

async function searchKhelomoreUids(
  client: ImapFlow,
  since: Date,
  before: Date | undefined,
  imapHost: string
): Promise<number[]> {
  if (imapHost.includes("gmail")) {
    let query = `from:info@khelomore.com subject:"You have a new booking from KheloMore" after:${formatGmailDate(since)}`;
    if (before) query += ` before:${formatGmailDate(before)}`;
    const uids = await client.search({ gmailraw: query }, { uid: true });
    return uids || [];
  }

  const searchQuery: Record<string, unknown> = {
    since,
    from: "info@khelomore.com",
  };
  if (before) searchQuery.before = before;
  const uids = await client.search(searchQuery, { uid: true });
  return uids || [];
}

export async function syncBookingsFromEmail(
  fullSync = false,
  options?: SyncOptions
) {
  const host = process.env.EMAIL_IMAP_HOST;
  const user = process.env.EMAIL_IMAP_USER;
  const pass = process.env.EMAIL_IMAP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "Email not configured. Set EMAIL_IMAP_HOST, EMAIL_IMAP_USER, EMAIL_IMAP_PASSWORD"
    );
  }

  if (!process.env.KHELOMORE_VENUE_NAME?.trim()) {
    throw new Error(
      "Venue filter not configured. Set KHELOMORE_VENUE_NAME (e.g. Lush Sports)"
    );
  }

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.EMAIL_IMAP_PORT || "993"),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let emailsFound = 0;
  let bookingsCreated = 0;
  let emailsSkipped = 0;
  const errors: string[] = [];
  const { since, before } = getSyncWindow(fullSync, options);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const uids = await searchKhelomoreUids(client, since, before, host);

      if (uids.length === 0) {
        return {
          emailsFound: 0,
          bookingsCreated: 0,
          emailsSkipped: 0,
          errors: [],
          fullSync,
          window: { since, before },
        };
      }

      for await (const message of client.fetch(
        uids,
        { source: true, envelope: true },
        { uid: true }
      )) {
        const from = message.envelope?.from?.[0]?.address || "";
        const subject = message.envelope?.subject || "";

        if (!isKhelomoreBookingEmail(from, subject)) continue;

        emailsFound++;

        const parsedEmail = await simpleParser(message.source!);
        const body = parsedEmail.html || parsedEmail.text || "";
        const messageId = parsedEmail.messageId || message.uid!.toString();

        const existing = await prisma.booking.findUnique({
          where: { emailMessageId: messageId },
        });
        if (existing) continue;

        const bookingData = parseKhelomoreEmail(subject, body);
        if (!bookingData) {
          errors.push(`Could not parse: ${subject.slice(0, 60)}`);
          continue;
        }

        if (bookingData.externalId) {
          const existingByExternalId = await prisma.booking.findUnique({
            where: { externalId: bookingData.externalId },
          });
          if (existingByExternalId) continue;
        }

        if (!matchesVenueFilter(bookingData)) {
          emailsSkipped++;
          continue;
        }

        await prisma.booking.create({
          data: {
            customerName: bookingData.customerName,
            customerPhone: bookingData.customerPhone,
            customerEmail: bookingData.customerEmail,
            venueName: bookingData.venueName,
            turfName: bookingData.turfName,
            location: bookingData.location,
            bookingDate: bookingData.bookingDate,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime,
            totalAmount: bookingData.totalAmount,
            slotPrice: bookingData.slotPrice,
            couponAmount: bookingData.couponAmount,
            paidOnKhelomore: bookingData.paidOnKhelomore,
            paymentStatus: bookingData.paidOnKhelomore
              ? BookingPaymentStatus.COMPLETED
              : BookingPaymentStatus.PENDING,
            externalId: bookingData.externalId,
            emailMessageId: messageId,
            rawEmailSubject: subject,
          },
        });
        bookingsCreated++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  await prisma.emailSyncLog.create({
    data: {
      emailsFound,
      bookingsCreated,
      errors: errors.length
        ? [...errors, `Skipped ${emailsSkipped} other venues`].join("; ")
        : emailsSkipped > 0
          ? `Skipped ${emailsSkipped} other venues`
          : null,
    },
  });

  return {
    emailsFound,
    bookingsCreated,
    emailsSkipped,
    errors,
    fullSync,
    window: { since, before },
  };
}
