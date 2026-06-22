import "dotenv/config";
import { syncBookingsFromEmail } from "../src/lib/email-sync";

const TOTAL_DAYS = 730;
const BATCH_DAYS = 14;

async function main() {
  let totalFound = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  const failed: string[] = [];

  console.log(`Starting 2-year email backfill (${TOTAL_DAYS} days in ${BATCH_DAYS}-day batches)...`);

  for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(0, start - BATCH_DAYS);
    const label = `days ${toDays}-${fromDays} ago`;

    process.stdout.write(`Syncing ${label}... `);

    try {
      const result = await syncBookingsFromEmail(true, {
        fromDaysAgo: fromDays,
        toDaysAgo: toDays,
        skipLog: toDays > 0,
      });

      totalFound += result.emailsFound;
      totalCreated += result.bookingsCreated;
      totalSkipped += result.emailsSkipped;

      console.log(
        `${result.bookingsCreated} new bookings from ${result.emailsFound} emails`
      );

      if (result.errors.length > 0) {
        failed.push(`${label}: ${result.errors.slice(0, 3).join("; ")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch failed";
      failed.push(`${label}: ${message}`);
      console.log(`FAILED — ${message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n=== Backfill complete ===");
  console.log(`Emails scanned: ${totalFound}`);
  console.log(`Bookings created: ${totalCreated}`);
  console.log(`Emails skipped (other venues): ${totalSkipped}`);
  if (failed.length > 0) {
    console.log(`Failed batches: ${failed.length}`);
    for (const item of failed.slice(0, 10)) {
      console.log(`  - ${item}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
