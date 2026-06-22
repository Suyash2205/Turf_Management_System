import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatAuditAction, canViewAuditLogs } from "@/lib/audit-log";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canViewAuditLogs(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
  );
  const action = searchParams.get("action");
  const email = searchParams.get("email")?.toLowerCase();
  const bookingId = searchParams.get("bookingId");

  const where = {
    ...(action && Object.values(AuditAction).includes(action as AuditAction)
      ? { action: action as AuditAction }
      : {}),
    ...(email ? { userEmail: { contains: email } } : {}),
    ...(bookingId ? { bookingId } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      actionLabel: formatAuditAction(log.action),
      userEmail: log.userEmail,
      userName: log.userName,
      userRole: log.userRole,
      entityType: log.entityType,
      entityId: log.entityId,
      bookingId: log.bookingId,
      summary: log.summary,
      details: log.details,
      createdAt: log.createdAt.toISOString(),
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
