import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmailSyncStatus } from "@/lib/email-sync-status";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailSync = await getEmailSyncStatus();
  return NextResponse.json(emailSync);
}
