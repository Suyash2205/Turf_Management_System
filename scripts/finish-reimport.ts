import "dotenv/config";
import { prisma } from "../src/lib/db";
import { syncBookingsFromEmail } from "../src/lib/email-sync";
import { recalculateBookingStatus } from "../src/lib/bookings";

// Finishes a full-reimport after Phase 1 (import) is already done: runs the
// cancellation sweep + status recalc only. Does NOT delete or re-import bookings.
// Cancellation application is idempotent, so re-sweeping already-swept batches is safe.
const TOTAL_DAYS = 220;
const BATCH_DAYS = 14;
const MAX_RETRIES = 3;
const BATCH_TIMEOUT_MS = 210000; // hard ceiling per batch; abort + retry if exceeded

function hardTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`batch timeout after ${ms / 1000}s`)), ms)
  );
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await Promise.race([fn(), hardTimeout(BATCH_TIMEOUT_MS)]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_RETRIES) throw error;
      const delay = attempt * 5000;
      console.log(`\n  ${label} failed (${msg}); retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  console.log("=== Finish reimport: cancellation sweep + recalc ===");

  // Optional [startDay endDay] window via argv to target/retry specific ranges.
  const startDay = process.argv[2] ? parseInt(process.argv[2], 10) : TOTAL_DAYS;
  const endDay = process.argv[3] ? parseInt(process.argv[3], 10) : 0;

  console.log(`\n--- Phase 2: Cancellation sweep (${startDay}d -> ${endDay}d) ---`);
  let totalRemoved = 0;
  let cancelEmails = 0;
  const skipped: string[] = [];
  for (let start = startDay; start > endDay; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(endDay, start - BATCH_DAYS);
    const label = `${toDays}-${fromDays}d`;
    process.stdout.write(`Cancel batch ${label}... `);
    try {
      const result = await withRetry(
        () =>
          syncBookingsFromEmail(true, {
            fromDaysAgo: fromDays,
            toDaysAgo: toDays,
            skipLog: true,
            cancellationsOnly: true,
          }),
        `Cancel batch ${label}`
      );
      totalRemoved += result.bookingsCancelled;
      cancelEmails += result.emailsFound;
      console.log(`${result.emailsFound} emails, removed/updated ${result.bookingsCancelled}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      skipped.push(label);
      console.log(`SKIPPED after retries (${msg})`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (skipped.length) console.log(`\n!! Skipped batches (retry later): ${skipped.join(", ")}`);

  console.log("\n--- Phase 3: Recalculate payment statuses ---");
  const allBookings = await prisma.booking.findMany({ select: { id: true } });
  let done = 0;
  for (const booking of allBookings) {
    await recalculateBookingStatus(booking.id);
    if (++done % 500 === 0) console.log(`  recalculated ${done}/${allBookings.length}`);
  }
  console.log(`Recalculated ${allBookings.length} bookings`);

  const emailAfter = await prisma.booking.count({ where: { NOT: { emailMessageId: { startsWith: "manual:" } } } });
  await prisma.emailSyncLog.create({
    data: {
      emailsFound: cancelEmails,
      bookingsCreated: 0,
      errors: `Finish reimport: cancellation sweep ${cancelEmails} emails, removed/updated ${totalRemoved}, final ${emailAfter} email bookings`,
    },
  });

  console.log("\n=== Finish reimport complete ===");
  console.log(`Cancellation emails processed: ${cancelEmails}`);
  console.log(`Bookings removed/trimmed: ${totalRemoved}`);
  console.log(`Email bookings now: ${emailAfter}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
