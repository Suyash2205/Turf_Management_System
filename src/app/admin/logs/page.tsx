import { AuditLogsClient } from "./audit-logs-client";
import { auth } from "@/lib/auth";
import { canViewAuditLogs } from "@/lib/audit-log";
import { redirect } from "next/navigation";

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }
  if (!canViewAuditLogs(session.user.email)) {
    redirect("/admin");
  }

  return <AuditLogsClient />;
}
