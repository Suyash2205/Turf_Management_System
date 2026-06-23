import "dotenv/config";
import { syncBookingsFromEmail } from "../src/lib/email-sync";

/**
 * Re-processes all Khelomore emails and imports any missing day-wise
 * bookings from bulk / recurring confirmation emails.
 */
async function main() {
  const TOTAL_DAYS = 730;
  const BATCH_DAYS = 14;
  let totalCreated = 0;

  console.log("Re-importing bulk/multi-day bookings from Gmail...");

  for (let start = TOTAL_DAYS; start > 0; start -= BATCH_DAYS) {
    const fromDays = start;
    const toDays = Math.max(0, start - BATCH_DAYS);
    process.stdout.write(`Batch days ${toDays}-${fromDays}... `);

    const result = await syncBookingsFromEmail(true, {
      fromDaysAgo: fromDays,
      toDaysAgo: toDays,
      skipLog: toDays > 0,
    });

    totalCreated += result.bookingsCreated;
    console.log(`+${result.bookingsCreated} new (${result.emailsFound} emails)`);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`\nDone. ${totalCreated} new day-wise bookings imported.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
