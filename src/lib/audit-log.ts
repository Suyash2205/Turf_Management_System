import type { Session } from "next-auth";
import { AuditAction, Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditActor = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type LogAuditInput = {
  action: AuditAction;
  summary: string;
  session?: Session | null;
  actor?: AuditActor | null;
  userEmail?: string;
  entityType?: string;
  entityId?: string;
  bookingId?: string;
  details?: Record<string, unknown>;
  request?: Request;
};

function getRequestMeta(request?: Request) {
  if (!request) return { ipAddress: null, userAgent: null };

  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent");

  return { ipAddress, userAgent };
}

function resolveActor(input: LogAuditInput) {
  if (input.actor) return input.actor;
  if (input.session?.user) {
    return {
      id: input.session.user.id,
      email: input.session.user.email,
      name: input.session.user.name,
      role: input.session.user.role,
    };
  }
  return null;
}

export async function logAudit(input: LogAuditInput) {
  try {
    const actor = resolveActor(input);
    const { ipAddress, userAgent } = getRequestMeta(input.request);

    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: actor?.id,
        userEmail: actor?.email ?? input.userEmail?.toLowerCase(),
        userName: actor?.name,
        userRole: actor?.role,
        entityType: input.entityType,
        entityId: input.entityId,
        bookingId: input.bookingId,
        summary: input.summary,
        details: (input.details as Prisma.InputJsonValue) ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: "Logged in",
  LOGIN_FAILED: "Login failed",
  LOGOUT: "Logged out",
  PAYMENT_RECORDED: "Payment recorded",
  PAYMENT_UPDATED: "Payment edited",
  PAYMENT_DELETED: "Payment deleted",
  PAYMENT_VERIFIED: "Payment verified",
  PAYMENT_REJECTED: "Payment rejected",
  PAYMENT_AUTO_VERIFIED: "Payment auto-verified",
  BOOKING_EXTRA_ADDED: "Extra charge added",
  BOOKING_EXTRA_UPDATED: "Extra charge updated",
  BOOKING_EXTRA_REMOVED: "Extra charge removed",
  BOOKING_EXTRA_HOURS_ADDED: "Extra hours added",
  BOOKING_CREATED: "Booking added",
  EMAIL_SYNC: "Email sync",
  BOOKING_CANCELLED: "Booking cancelled",
  BOOKING_DELETED: "Booking removed",
  BANK_STATEMENT_UPLOADED: "Bank statement uploaded",
};

export function formatAuditAction(action: AuditAction) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

const AUDIT_LOG_VIEWER_EMAILS = new Set([
  "sunil@turfpay.com",
  "suyash@turfpay.com",
]);

export function canViewAuditLogs(email: string) {
  return AUDIT_LOG_VIEWER_EMAILS.has(email.trim().toLowerCase());
}
