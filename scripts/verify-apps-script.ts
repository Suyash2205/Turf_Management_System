import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.emailSyncLog.findMany({
    orderBy: { syncedAt: "desc" },
    take: 20,
    select: { syncedAt: true, emailsFound: true, bookingsCreated: true },
  });

  console.log("=== EmailSyncLog (last 20, IST) ===");
  for (const log of logs) {
    const time = log.syncedAt.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: true,
    });
    console.log(
      `${time} | emails: ${log.emailsFound} | new bookings: ${log.bookingsCreated}`
    );
  }

  const total = await prisma.emailSyncLog.count();
  console.log(`\nTotal sync log entries: ${total}`);

  if (logs.length >= 2) {
    const gapMs =
      logs[0].syncedAt.getTime() - logs[1].syncedAt.getTime();
    const gapMin = Math.round(gapMs / 60000);
    console.log(`Gap between last 2 syncs: ~${gapMin} minute(s)`);
  }

  const cronSecret = process.env.CRON_SECRET;
  const siteUrl =
    process.env.VERIFY_SITE_URL ||
    "https://turf-management-system-five.vercel.app";

  if (!cronSecret) {
    console.log("\nCRON_SECRET not set locally — skipping live API test");
    return;
  }

  console.log("\n=== Live sync API test ===");
  const res = await fetch(`${siteUrl}/api/email/sync`, {
    method: "POST",
    headers: { "x-cron-secret": cronSecret },
  });
  const body = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(body.slice(0, 300));

  const latest = await prisma.emailSyncLog.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  if (latest) {
    console.log(
      "\nLatest log after test:",
      latest.syncedAt.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
      })
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
