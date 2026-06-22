import { prisma } from "@/lib/db";

export async function getEmailSyncStatus() {
  const lastEmailSync = await prisma.emailSyncLog.findFirst({
    orderBy: { syncedAt: "desc" },
    select: {
      syncedAt: true,
      emailsFound: true,
      bookingsCreated: true,
      errors: true,
    },
  });

  const schedule =
    process.env.EMAIL_SYNC_MODE === "poll"
      ? "Every ~1 minute via Gmail auto-sync"
      : "Once daily at 2:30 AM UTC via Vercel cron";

  if (!lastEmailSync) {
    return {
      lastSyncedAt: null,
      emailsFound: 0,
      bookingsCreated: 0,
      errors: null,
      schedule,
    };
  }

  return {
    lastSyncedAt: lastEmailSync.syncedAt.toISOString(),
    emailsFound: lastEmailSync.emailsFound,
    bookingsCreated: lastEmailSync.bookingsCreated,
    errors: lastEmailSync.errors,
    schedule,
  };
}
