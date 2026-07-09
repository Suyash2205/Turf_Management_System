import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { syncBookingsFromEmail } from "@/lib/email-sync";
import { logAudit } from "@/lib/audit-log";
import { isCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const options =
      fromDays != null
        ? {
            fromDaysAgo: parseInt(fromDays, 10),
            toDaysAgo: toDays != null ? parseInt(toDays, 10) : 0,
            skipLog: true,
          }
        : undefined;

    const result = await syncBookingsFromEmail(fullSync, options);

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
