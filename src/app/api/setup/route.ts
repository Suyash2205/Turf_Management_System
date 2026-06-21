import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret =
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminPassword = await bcrypt.hash("admin123", 12);
  const staffPassword = await bcrypt.hash("staff123", 12);

  await prisma.user.upsert({
    where: { email: "admin@turfpay.com" },
    update: { password: adminPassword, name: "Admin", role: "ADMIN" },
    create: {
      email: "admin@turfpay.com",
      password: adminPassword,
      name: "Admin",
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "staff@turfpay.com" },
    update: { password: staffPassword, name: "Ground Staff", role: "STAFF" },
    create: {
      email: "staff@turfpay.com",
      password: staffPassword,
      name: "Ground Staff",
      role: "STAFF",
    },
  });

  const count = await prisma.user.count();
  return NextResponse.json({ ok: true, users: count });
}
