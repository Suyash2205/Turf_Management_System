import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncBookingsFromEmail } from "@/lib/email-sync";

export async function POST(request: Request) {
  const session = await auth();
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = cronSecret === process.env.CRON_SECRET;

  if (!isCron && (!session || session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncBookingsFromEmail();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
