import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncBookingsFromEmail } from "@/lib/email-sync";
import { logAudit } from "@/lib/audit-log";
import { isCronRequest } from "@/lib/cron-auth";
import { pingHeartbeat } from "@/lib/heartbeat";

export const runtime = "nodejs";
// A backlog sync downloads many IMAP bodies and can exceed 60s, which silently
// 504'd every scheduled run before it could write its log (Pro allows up to 300).
export const maxDuration = 300;

// A scheduled sync only needs to do real work every ~15 min. If something calls
// this endpoint more often (a stray external poller, an overlapping cron), skip
// the IMAP + DB work instead of repeating it. Bounds cost regardless of caller.
// Admin-triggered and full syncs always run — they explicitly asked for it.
const MIN_SYNC_INTERVAL_MS = 8 * 60 * 1000;

async function recentlySynced(): Promise<boolean> {
  const last = await prisma.emailSyncLog.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  if (!last) return false;
  return Date.now() - last.syncedAt.getTime() < MIN_SYNC_INTERVAL_MS;
}

function isAuthorized(request: Request, session: Session | null) {
  if (isCronRequest(request)) return true;
  return !!session?.user && session.user.role === "ADMIN";
}

async function handleSync(request: Request) {
  const session = await auth();

  if (!isAuthorized(request, session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const fullSync = searchParams.get("full") === "true";
    const fromDays = searchParams.get("fromDays");
    const toDays = searchParams.get("toDays");

    const isAdmin = session?.user?.role === "ADMIN";
    if (!isAdmin && !fullSync && (await recentlySynced())) {
      return NextResponse.json({ skipped: "throttled" });
    }

    const options =
      fromDays != null
        ? {
            fromDaysAgo: parseInt(fromDays, 10),
            toDaysAgo: toDays != null ? parseInt(toDays, 10) : 0,
            skipLog: true,
          }
        : undefined;

    const result = await syncBookingsFromEmail(fullSync, options);
    await pingHeartbeat(process.env.HEARTBEAT_EMAIL_SYNC_URL, "success");

    if (session?.user) {
      await logAudit({
        action: "EMAIL_SYNC",
        session,
        summary: `${session.user.email} synced emails (${result.bookingsCreated} new, ${result.bookingsCancelled} cancelled from ${result.emailsFound} emails)`,
        details: {
          fullSync,
          emailsFound: result.emailsFound,
          bookingsCreated: result.bookingsCreated,
          bookingsCancelled: result.bookingsCancelled,
          emailsSkipped: result.emailsSkipped,
        },
        request,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Email sync error:", error);
    await pingHeartbeat(process.env.HEARTBEAT_EMAIL_SYNC_URL, "fail");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}
