import { NextResponse } from "next/server";
import { auth, signOut } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await logAudit({
    action: "LOGOUT",
    session,
    summary: `${session.user.email} logged out`,
    request,
  });

  return NextResponse.json({ ok: true });
}
