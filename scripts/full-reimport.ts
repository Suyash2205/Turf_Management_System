import "dotenv/config";
import { prisma } from "../src/lib/db";
import { syncBookingsFromEmail } from "../src/lib/email-sync";
import { recalculateBookingStatus } from "../src/lib/bookings";

const TOTAL_DAYS = 220; // Gmail has ~7 months; 220 covers it with margin
const BATCH_DAYS = 14;
const MAX_RETRIES = 4;

/** Retry a batch on transient network/IMAP failures instead of aborting the whole run. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
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
  if (process.env.ALLOW_FULL_REIMPORT !== "true") {
    throw new Error(
      "Refusing expensive full reimport. Set ALLOW_FULL_REIMPORT=true for intentional runs."
    );
  }

  const manualBefore = await prisma.booking.count({
    where: { emailMessageId: { startsWith: "manual:" } },
  });
  const emailBefore = await prisma.booking.count({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });

  console.log("=== Full reimport starting ===");
  console.log(`Email bookings to delete: ${emailBefore}`);
  console.log(`Manual bookings to keep: ${manualBefore}`);

  const deleted = await prisma.booking.deleteMany({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });
  console.log(`Deleted ${deleted.count} email-sourced bookings`);

  let totalCreated = 0;
  let totalEmails = 0;

  console.log("\n--- Phase 1: Import booking emails ---");
  for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(0, start - BATCH_DAYS);
    process.stdout.write(`Import batch ${toDays}-${fromDays}d... `);

    const result = await withRetry(
      () =>
        syncBookingsFromEmail(true, {
          fromDaysAgo: fromDays,
          toDaysAgo: toDays,
          skipLog: true,
          bookingsOnly: true,
        }),
      `Import batch ${toDays}-${fromDays}d`
    );

    totalCreated += result.bookingsCreated;
    totalEmails += result.emailsFound;
    console.log(
      `+${result.bookingsCreated} bookings (${result.emailsFound} emails)`
    );

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.slice(0, 2).join("; ")}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const afterImport = await prisma.booking.count({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });

  console.log("\n--- Phase 2: Cancellation sweep (oldest first) ---");
  let totalRemoved = 0;
  let cancelEmails = 0;

  for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(0, start - BATCH_DAYS);
    process.stdout.write(`Cancel batch ${toDays}-${fromDays}d... `);

    const result = await withRetry(
      () =>
        syncBookingsFromEmail(true, {
          fromDaysAgo: fromDays,
          toDaysAgo: toDays,
          skipLog: true,
          cancellationsOnly: true,
        }),
      `Cancel batch ${toDays}-${fromDays}d`
    );

    totalRemoved += result.bookingsCancelled;
    cancelEmails += result.emailsFound;
    console.log(
      `${result.emailsFound} emails, removed ${result.bookingsCancelled}`
    );

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n--- Phase 3: Recalculate payment statuses ---");
  const allBookings = await prisma.booking.findMany({ select: { id: true } });
  for (const booking of allBookings) {
    await recalculateBookingStatus(booking.id);
  }
  console.log(`Recalculated ${allBookings.length} bookings`);

  const emailAfter = await prisma.booking.count({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } } },
  });
  const manualAfter = await prisma.booking.count({
    where: { emailMessageId: { startsWith: "manual:" } },
  });

  await prisma.emailSyncLog.create({
    data: {
      emailsFound: totalEmails + cancelEmails,
      bookingsCreated: totalCreated,
      errors: `Full reimport: deleted ${deleted.count}, imported ${totalCreated}, removed ${totalRemoved} cancelled, final ${emailAfter} email bookings`,
    },
  });

  console.log("\n=== Full reimport complete ===");
  console.log(`Booking emails processed: ${totalEmails}`);
  console.log(`Bookings created: ${totalCreated}`);
  console.log(`Cancellation emails: ${cancelEmails}`);
  console.log(`Cancelled rows removed: ${totalRemoved}`);
  console.log(`Email bookings now: ${emailAfter} (was ${emailBefore})`);
  console.log(`Manual bookings kept: ${manualAfter}`);
  console.log(`After import (before cancel): ${afterImport}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
