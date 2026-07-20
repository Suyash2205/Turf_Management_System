import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmailSyncStatus } from "@/lib/email-sync-status";
import { isCronRequest } from "@/lib/cron-auth";

// Read-only. Also accepts the cron secret so an external watchdog (a Google
// Apps Script) can poll sync freshness and alert if it goes stale.
export async function GET(request: Request) {
  const session = await auth();
  if (!isCronRequest(request) && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailSync = await getEmailSyncStatus();
  return NextResponse.json(emailSync);
}
