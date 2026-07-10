import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { syncDatabaseToGoogleSheets } from "@/lib/google-sheets-sync";
import { isCronRequest } from "@/lib/cron-auth";
import { pingHeartbeat } from "@/lib/heartbeat";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const result = await syncDatabaseToGoogleSheets();
    await pingHeartbeat(process.env.HEARTBEAT_SHEETS_SYNC_URL, "success");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Google Sheets sync failed:", error);
    await pingHeartbeat(process.env.HEARTBEAT_SHEETS_SYNC_URL, "fail");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sheets sync failed" },
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
