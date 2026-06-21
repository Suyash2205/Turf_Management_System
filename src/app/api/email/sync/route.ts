import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncBookingsFromEmail } from "@/lib/email-sync";

function isAuthorized(request: Request, session: Awaited<ReturnType<typeof auth>>) {
  const cronSecret = request.headers.get("x-cron-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");
  const isCron =
    cronSecret === process.env.CRON_SECRET ||
    querySecret === process.env.CRON_SECRET;

  if (isCron) return true;
  return !!session && session.user.role === "ADMIN";
}

async function handleSync(request: Request) {
  const session = await auth();

  if (!isAuthorized(request, session)) {
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

// GET for external cron services; POST for Apps Script / admin
export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}
