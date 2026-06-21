/**
 * Gmail Instant Sync — Google Apps Script
 *
 * Checks sunilhumne@gmail.com every 1 minute and triggers TurfPay sync.
 * This is the fastest free option (Vercel Hobby only allows 1 cron/day).
 *
 * SETUP (5 minutes):
 * 1. Open https://script.google.com while logged into sunilhumne@gmail.com
 * 2. New project → paste this entire file
 * 3. Update SITE_URL and CRON_SECRET below (CRON_SECRET = value in Vercel env)
 * 4. Save → Run → syncTurfPay (authorize when prompted)
 * 5. Triggers (clock icon) → Add Trigger:
 *    - Function: syncTurfPay
 *    - Event: Time-driven
 *    - Type: Minutes timer → Every minute
 * 6. Done — bookings appear within ~1 minute of Khelomore email
 */

const SITE_URL = "https://turf-management-system-five.vercel.app";
const CRON_SECRET = "PASTE_YOUR_CRON_SECRET_HERE";

function syncTurfPay() {
  const url = SITE_URL + "/api/email/sync";

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "x-cron-secret": CRON_SECRET,
    },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code !== 200) {
    console.error("Sync failed (" + code + "): " + body);
    return;
  }

  console.log("Sync OK: " + body);
}

// Run once manually to test
function testSync() {
  syncTurfPay();
}
