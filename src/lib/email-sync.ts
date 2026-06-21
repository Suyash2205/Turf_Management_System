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
  /** Start of window: days ago from today (e.g. 30 = 30 days back) */
  fromDaysAgo?: number;
  /** End of window: days ago from today (e.g. 0 = today). Default 0 */
  toDaysAgo?: number;
}

function getSyncWindow(fullSync: boolean, options?: SyncOptions) {
  if (options?.fromDaysAgo != null) {
    const from = new Date();
    from.setDate(from.getDate() - options.fromDaysAgo);
    from.setHours(0, 0, 0, 0);

    const toDays = options.toDaysAgo ?? 0;
    const to = new Date();
    to.setDate(to.getDate() - toDays);
    to.setHours(23, 59, 59, 999);

    return { since: from, before: toDays > 0 ? to : undefined };
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
      // Only search Khelomore emails — avoids downloading entire inbox
      const searchQuery: Record<string, unknown> = {
        since,
        from: "info@khelomore.com",
      };
      if (before) searchQuery.before = before;

      const uids = await client.search(searchQuery, { uid: true });
      if (!uids || uids.length === 0) {
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
