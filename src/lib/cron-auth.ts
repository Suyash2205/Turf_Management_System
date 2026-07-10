/**
 * Vercel sends the CRON_SECRET as `Authorization: Bearer <secret>` when it
 * invokes a cron job — not as a custom header or query param. Routes that only
 * looked for `x-cron-secret`/`?secret=` rejected every scheduled run with a 401.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel stamps every cron invocation with the schedule that triggered it.
  const fromVercelCron = request.headers.has("x-vercel-cron-schedule");

  if (!secret) {
    if (fromVercelCron) {
      console.error(
        "CRON MISCONFIGURED: Vercel invoked a cron job but CRON_SECRET is not set, so the request cannot be authorized. Scheduled syncs will not run."
      );
    }
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  // Retained so manual invocations and existing tooling keep working.
  if (request.headers.get("x-cron-secret") === secret) return true;
  if (new URL(request.url).searchParams.get("secret") === secret) return true;

  // A rejected request that Vercel's scheduler sent is always a bug on our side:
  // the cron will keep "succeeding" with a 401 and syncs will silently stop.
  if (fromVercelCron) {
    console.error(
      `CRON REJECTED: Vercel cron (schedule "${request.headers.get(
        "x-vercel-cron-schedule"
      )}") failed authorization for ${new URL(request.url).pathname}. ` +
        `Authorization header ${authHeader ? "present but did not match" : "absent"}. ` +
        "CRON_SECRET in the environment likely differs from the one Vercel is sending."
    );
  }

  return false;
}
