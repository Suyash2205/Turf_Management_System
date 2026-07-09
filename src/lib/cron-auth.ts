/**
 * Vercel sends the CRON_SECRET as `Authorization: Bearer <secret>` when it
 * invokes a cron job — not as a custom header or query param. Routes that only
 * looked for `x-cron-secret`/`?secret=` rejected every scheduled run with a 401.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  // Retained so manual invocations and existing tooling keep working.
  if (request.headers.get("x-cron-secret") === secret) return true;
  if (new URL(request.url).searchParams.get("secret") === secret) return true;

  return false;
}
