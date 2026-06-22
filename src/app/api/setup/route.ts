import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { upsertDefaultUsers } from "@/lib/default-users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret =
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await upsertDefaultUsers(prisma);
    const count = await prisma.user.count();
    return NextResponse.json({ ok: true, users: count });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}
