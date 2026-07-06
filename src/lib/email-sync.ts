import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import {
  isKhelomoreBookingEmail,
  matchesVenueFilter,
  parseKhelomoreModificationBookings,
  parseKhelomoreEmails,
  parseBookingId,
  khelomoreChangeEmailSubjectQuery,
} from "@/lib/email-parser";
import { applyKhelomoreBookingChanges } from "@/lib/cancelled-bookings";
import { isBookingImportCancelled } from "@/lib/cancelled-slot-registry";
import { BookingPaymentStatus } from "@prisma/client";

export interface SyncOptions {
  fromDaysAgo?: number;
  toDaysAgo?: number;
  /** Skip writing EmailSyncLog (used for batched full sync) */
  skipLog?: boolean;
  /** Import new booking emails only (skip cancellation handling) */
  bookingsOnly?: boolean;
  /** Process cancellation/modified emails only */
  cancellationsOnly?: boolean;
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

function extractExternalId(subject: string, body: string): string | null {
  return parseBookingId(subject, body);
}

async function searchKhelomoreUids(
  client: ImapFlow,
  since: Date,
  before: Date | undefined,
  imapHost: string,
  options?: SyncOptions
): Promise<number[]> {
  const venue = process.env.KHELOMORE_VENUE_NAME?.trim();

  if (imapHost.includes("gmail")) {
    let query: string;
    if (options?.cancellationsOnly) {
      query = `from:info@khelomore.com ${khelomoreChangeEmailSubjectQuery()}`;
    } else if (options?.bookingsOnly) {
      query =
        'from:info@khelomore.com subject:"You have a new booking from KheloMore"';
    } else {
      query = `from:info@khelomore.com (subject:"You have a new booking from KheloMore" OR ${khelomoreChangeEmailSubjectQuery()})`;
    }
    if (venue) query += ` "${venue}"`;
    query += ` after:${formatGmailDate(since)}`;
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

interface EmailCandidate {
  uid: number;
  from: string;
  subject: string;
  externalId: string | null;
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
    // Fail fast on a dead/hung socket instead of blocking forever. A stalled fetch
    // then rejects the pending operation, which the caller's retry can recover from.
    greetingTimeout: 20000,
    socketTimeout: 60000,
  });

  // Without an "error" listener, a mid-operation socket drop emits an unhandled
  // "error" event that crashes the whole process. Swallow it here — the pending
  // operation still rejects and is handled by the caller's try/finally.
  client.on("error", (err) => {
    console.error("IMAP client error:", err instanceof Error ? err.message : err);
  });

  let emailsFound = 0;
  let bookingsCreated = 0;
  let bookingsCancelled = 0;
  let emailsSkipped = 0;
  const errors: string[] = [];
  const { since, before } = getSyncWindow(fullSync, options);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const uids = await searchKhelomoreUids(client, since, before, host, options);

      if (uids.length === 0) {
        return {
          emailsFound: 0,
          bookingsCreated: 0,
          bookingsCancelled: 0,
          emailsSkipped: 0,
          errors: [],
          fullSync,
          window: { since, before },
        };
      }

      // Phase 1: envelope only — cheap filter + dedupe before downloading bodies
      const candidates: EmailCandidate[] = [];
      for await (const message of client.fetch(
        uids,
        { envelope: true },
        { uid: true }
      )) {
        const from = message.envelope?.from?.[0]?.address || "";
        const subject = message.envelope?.subject || "";
        if (!isKhelomoreBookingEmail(from, subject)) continue;
        candidates.push({
          uid: message.uid!,
          from,
          subject,
          externalId: parseBookingId(subject, ""),
        });
      }

      emailsFound = candidates.length;
      if (candidates.length === 0) {
        return {
          emailsFound: 0,
          bookingsCreated: 0,
          bookingsCancelled: 0,
          emailsSkipped: 0,
          errors: [],
          fullSync,
          window: { since, before },
        };
      }

      const externalIds = candidates
        .map((c) => c.externalId)
        .filter((id): id is string => !!id);

      const candidateByUid = new Map(candidates.map((c) => [c.uid, c]));

      const existingByExternalId =
        externalIds.length > 0
          ? await prisma.booking.findMany({
              where: {
                OR: externalIds.flatMap((id) => [
                  { externalId: id },
                  { externalId: { startsWith: `${id}#` } },
                ]),
              },
              select: { externalId: true },
            })
          : [];
      const knownExternalIds = new Set(
        existingByExternalId.map((b) => b.externalId)
      );

      // Always download bodies so multi-day / bulk emails can fill missing days.
      const uidsToDownload = candidates.map((c) => c.uid);

      // Phase 2: download bodies, apply cancellations first, then import bookings.
      const downloaded: Array<{
        candidate: EmailCandidate;
        body: string;
        baseMessageId: string;
        externalId: string | null;
      }> = [];

      for await (const message of client.fetch(
        uidsToDownload,
        { source: true },
        { uid: true }
      )) {
        const candidate = candidateByUid.get(message.uid!);
        if (!candidate) continue;

        const parsedEmail = await simpleParser(message.source!);
        const body = parsedEmail.html || parsedEmail.text || "";
        downloaded.push({
          candidate,
          body,
          baseMessageId: parsedEmail.messageId || String(message.uid),
          externalId:
            candidate.externalId || extractExternalId(candidate.subject, body),
        });
      }

      for (const item of downloaded) {
        if (options?.bookingsOnly) continue;

        const modification = parseKhelomoreModificationBookings(
          item.candidate.subject,
          item.body
        );
        if (modification === null) continue;

        const changeResult = await applyKhelomoreBookingChanges(
          item.externalId,
          modification,
          {
            emailSubject: item.candidate.subject,
            source: "email-sync",
          }
        );
        bookingsCancelled += changeResult.removed + changeResult.updated;
      }

      for (const item of downloaded) {
        if (options?.cancellationsOnly) continue;

        const modification = parseKhelomoreModificationBookings(
          item.candidate.subject,
          item.body
        );
        if (modification !== null) continue;

        const bookingEntries = parseKhelomoreEmails(
          item.candidate.subject,
          item.body
        );
        if (bookingEntries.length === 0) {
          if (!options?.cancellationsOnly) {
            errors.push(
              `Could not parse: ${item.candidate.subject.slice(0, 60)}`
            );
          }
          continue;
        }

        for (const bookingData of bookingEntries) {
          const dateKey = bookingData.bookingDate.toISOString().slice(0, 10);
          const emailMessageId =
            bookingEntries.length > 1
              ? `${item.baseMessageId}#${dateKey}`
              : item.baseMessageId;

          const existingMessage = await prisma.booking.findUnique({
            where: { emailMessageId },
          });
          if (existingMessage) continue;

          if (
            bookingData.externalId &&
            knownExternalIds.has(bookingData.externalId)
          ) {
            continue;
          }

          if (await isBookingImportCancelled(bookingData, emailMessageId)) {
            continue;
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
              paymentStatus:
                bookingData.paidOnKhelomore || bookingData.totalAmount <= 0
                  ? BookingPaymentStatus.COMPLETED
                  : BookingPaymentStatus.PENDING,
              externalId: bookingData.externalId,
              emailMessageId,
              rawEmailSubject: item.candidate.subject,
            },
          });
          bookingsCreated++;
          if (bookingData.externalId) {
            knownExternalIds.add(bookingData.externalId);
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  if (!options?.skipLog) {
    await prisma.emailSyncLog.create({
      data: {
        emailsFound,
        bookingsCreated,
        errors: errors.length
          ? [
              ...errors,
              `Skipped ${emailsSkipped} other venues`,
              `Removed ${bookingsCancelled} cancelled bookings`,
            ].join("; ")
          : emailsSkipped > 0 || bookingsCancelled > 0
            ? `Skipped ${emailsSkipped} other venues; Removed ${bookingsCancelled} cancelled bookings`
            : null,
      },
    });
  }

  return {
    emailsFound,
    bookingsCreated,
    bookingsCancelled,
    emailsSkipped,
    errors,
    fullSync,
    window: { since, before },
  };
}
