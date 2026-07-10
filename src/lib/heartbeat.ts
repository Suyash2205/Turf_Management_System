/**
 * Dead-man's switch for scheduled jobs.
 *
 * In-app logging cannot detect the one failure mode that matters most: the cron
 * never running at all, so our code never executes to report anything. Instead
 * the job pings an external monitor on each run. If a ping does not arrive on
 * schedule, the monitor alerts us.
 *
 * Compatible with healthchecks.io / Better Stack / cron-job.org conventions:
 *   GET <url>        -> success
 *   GET <url>/start  -> job started (lets the monitor measure duration)
 *   GET <url>/fail   -> job failed
 *
 * Never throws and never blocks the caller for long: a monitoring outage must
 * not take down a sync.
 */
export type HeartbeatSignal = "start" | "success" | "fail";

const PING_TIMEOUT_MS = 5000;

function pingUrl(baseUrl: string, signal: HeartbeatSignal): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (signal === "success") return base;
  return `${base}/${signal}`;
}

export async function pingHeartbeat(
  baseUrl: string | undefined,
  signal: HeartbeatSignal
): Promise<void> {
  if (!baseUrl) return; // Unconfigured: silently do nothing.

  try {
    await fetch(pingUrl(baseUrl, signal), {
      method: "GET",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // A failed heartbeat is worth knowing about, but must never fail the job.
    console.error(
      `Heartbeat ping "${signal}" failed:`,
      error instanceof Error ? error.message : error
    );
  }
}
