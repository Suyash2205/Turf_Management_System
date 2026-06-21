import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import {
  isKhelomoreBookingEmail,
  matchesVenueFilter,
  parseKhelomoreEmail,
} from "@/lib/email-parser";
import { BookingPaymentStatus } from "@prisma/client";

function getSyncSinceDate(fullSync = false): Date {
  const daysBack = parseInt(process.env.EMAIL_SYNC_LOOKBACK_DAYS || "30", 10);

  if (fullSync) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    return since;
  }

  // When polling frequently, only scan recent mail (much faster)
  if (process.env.EMAIL_SYNC_MODE === "poll") {
    const pollDays = parseInt(process.env.EMAIL_SYNC_POLL_DAYS || "2", 10);
    const since = new Date();
    since.setDate(since.getDate() - pollDays);
    return since;
  }

  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  return since;
}

export async function syncBookingsFromEmail(fullSync = false) {
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
  const since = getSyncSinceDate(fullSync);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      for await (const message of client.fetch(
        { since },
        { source: true, envelope: true }
      )) {
        const from = message.envelope?.from?.[0]?.address || "";
        const subject = message.envelope?.subject || "";

        if (!isKhelomoreBookingEmail(from, subject)) continue;

        emailsFound++;

        const parsedEmail = await simpleParser(message.source!);
        const body = parsedEmail.html || parsedEmail.text || "";
        const messageId = parsedEmail.messageId || message.uid.toString();

        const existing = await prisma.booking.findUnique({
          where: { emailMessageId: messageId },
        });
        if (existing) continue;

        const bookingData = parseKhelomoreEmail(subject, body);
        if (!bookingData) {
          errors.push(`Could not parse email: ${subject}`);
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
        ? [...errors, `Skipped ${emailsSkipped} emails for other venues`].join("; ")
        : emailsSkipped > 0
          ? `Skipped ${emailsSkipped} emails for other venues`
          : null,
    },
  });

  return { emailsFound, bookingsCreated, emailsSkipped, errors, fullSync };
}
