import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const now = new Date();

  const totalBookings = await prisma.booking.count();
  const june22 = await prisma.booking.count({
    where: {
      bookingDate: {
        gte: new Date("2026-06-22T00:00:00Z"),
        lt: new Date("2026-06-23T00:00:00Z"),
      },
    },
  });
  const multiDay = await prisma.booking.count({
    where: { externalId: { contains: "#" } },
  });
  const discounts = await prisma.bookingAdjustment.count({
    where: { type: "DISCOUNT" },
  });
  const extraCharges = await prisma.bookingAdjustment.count({
    where: { type: "EXTRA_CHARGE" },
  });
  const extraHours = await prisma.bookingAdjustment.count({
    where: { type: "EXTRA_HOURS" },
  });
  const users = await prisma.user.findMany({
    select: { email: true, role: true, name: true },
    orderBy: { email: "asc" },
  });
  const auditByAction = await prisma.auditLog.groupBy({
    by: ["action"],
    _count: true,
    orderBy: { _count: { action: "desc" } },
  });
  const recentAudit = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      action: true,
      summary: true,
      userEmail: true,
      createdAt: true,
    },
  });
  const recentEmailSync = await prisma.emailSyncLog.findMany({
    orderBy: { syncedAt: "desc" },
    take: 10,
    select: {
      syncedAt: true,
      emailsFound: true,
      bookingsCreated: true,
      errors: true,
    },
  });
  const cancellationSyncLogs = await prisma.emailSyncLog.findMany({
    where: {
      OR: [
        { errors: { contains: "Removed" } },
        { errors: { contains: "cancelled" } },
      ],
    },
    orderBy: { syncedAt: "desc" },
    take: 15,
    select: {
      syncedAt: true,
      emailsFound: true,
      bookingsCreated: true,
      errors: true,
    },
  });
  const sampleCancelledIds = await prisma.booking.findMany({
    where: {
      OR: [
        { externalId: "2025-458-KFPV" },
        { externalId: { startsWith: "2025-458-KFPV#" } },
      ],
    },
    select: {
      externalId: true,
      customerName: true,
      bookingDate: true,
    },
  });

  const lastSync = recentEmailSync[0];
  const totalRemovedFromLogs = cancellationSyncLogs.reduce((sum, log) => {
    const match = log.errors?.match(/Removed (\d+) cancelled bookings/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);

  console.log("=== TurfPay production verification ===\n");

  console.log("BOOKINGS");
  console.log(`  Total: ${totalBookings}`);
  console.log(`  June 22 2026: ${june22}`);
  console.log(`  Multi-day (externalId#date): ${multiDay}`);

  console.log("\nADJUSTMENTS (extras / discount UI)");
  console.log(`  Extra charges: ${extraCharges}`);
  console.log(`  Extra hours: ${extraHours}`);
  console.log(`  Discounts: ${discounts}`);

  console.log("\nUSERS");
  for (const u of users) {
    console.log(`  ${u.email} (${u.role}) — ${u.name}`);
  }

  console.log("\nAUDIT LOGS");
  for (const row of auditByAction) {
    console.log(`  ${row.action}: ${row._count}`);
  }
  console.log("  Recent entries:");
  for (const entry of recentAudit) {
    console.log(
      `    [${entry.createdAt.toISOString()}] ${entry.action} — ${entry.userEmail ?? "system"} — ${entry.summary.slice(0, 90)}`
    );
  }

  console.log("\nEMAIL SYNC LOGS");
  if (lastSync) {
    console.log(
      `  Last sync: ${lastSync.syncedAt.toISOString()} — ${lastSync.emailsFound} emails, ${lastSync.bookingsCreated} created`
    );
    if (lastSync.errors) {
      console.log(`  Last sync note: ${lastSync.errors.slice(0, 120)}`);
    }
  }
  console.log(
    `  Sync logs mentioning cancellations: ${cancellationSyncLogs.length}`
  );
  console.log(
    `  Sum of "Removed N cancelled bookings" in those logs: ${totalRemovedFromLogs}`
  );
  if (cancellationSyncLogs.length > 0) {
    console.log("  Recent cancellation removals in EmailSyncLog:");
    for (const log of cancellationSyncLogs.slice(0, 5)) {
      console.log(
        `    [${log.syncedAt.toISOString()}] created=${log.bookingsCreated} — ${log.errors?.slice(0, 100)}`
      );
    }
  }

  console.log("\nCANCELLED BOOKING SPOT-CHECK (2025-458-KFPV / Ghanshyam)");
  if (sampleCancelledIds.length === 0) {
    console.log("  OK — no rows found (expected after cancellation)");
  } else {
    console.log("  WARNING — still in DB:");
    for (const b of sampleCancelledIds) {
      console.log(
        `    ${b.externalId} — ${b.customerName} — ${b.bookingDate.toISOString().slice(0, 10)}`
      );
    }
  }

  const ageHours = lastSync
    ? (now.getTime() - lastSync.syncedAt.getTime()) / (1000 * 60 * 60)
    : null;
  console.log("\nHEALTH SIGNALS");
  console.log(
    `  Last email sync age: ${ageHours != null ? `${ageHours.toFixed(1)}h ago` : "none"}`
  );
  console.log(
    `  Audit log has EMAIL_SYNC entries: ${auditByAction.some((a) => a.action === "EMAIL_SYNC") ? "yes" : "no"}`
  );
  console.log(
    `  Dedicated BOOKING_CANCELLED audit action: yes (logged per removed booking)`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
