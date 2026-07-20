/**
 * TurfPay Sync Watchdog — Google Apps Script (dead-man's switch)
 *
 * Emails you if the Gmail→TurfPay sync stops working, for ANY reason:
 * a function timeout, a dead cron, a disabled trigger, an expired card.
 * Self-contained — no third-party accounts. Runs in your own Google account
 * and emails you from your own Gmail.
 *
 * HOW IT WORKS: every hour it reads TurfPay's sync-status endpoint and checks
 * how long ago the last successful sync was. If that's older than STALE_MINUTES,
 * it emails you (at most once per ALERT_COOLDOWN_HOURS so you're not spammed),
 * and emails a "recovered" note once sync comes back.
 *
 * SETUP (2 minutes):
 * 1. Open https://script.google.com while logged into the account that should
 *    receive the alerts → New project → paste this entire file.
 * 2. Set CRON_SECRET below to the same value used in your syncTurfPay script
 *    (and in Vercel's CRON_SECRET env var).
 * 3. Save → Run → checkSyncHealth once (authorize when prompted; the first run
 *    also confirms it can reach the endpoint).
 * 4. Triggers (clock icon) → Add Trigger:
 *      - Function: checkSyncHealth
 *      - Event source: Time-driven
 *      - Type: Hour timer → Every hour
 * 5. Done.
 */

const SITE_URL = "https://turf-management-system-five.vercel.app";
const CRON_SECRET = "PASTE_YOUR_CRON_SECRET_HERE"; // same value as syncTurfPay
const NOTIFY_EMAIL = ""; // leave blank to email the account running this script
const STALE_MINUTES = 90; // alert if no successful sync in this many minutes
const ALERT_COOLDOWN_HOURS = 6; // don't re-alert more often than this

function checkSyncHealth() {
  const props = PropertiesService.getScriptProperties();
  const recipient = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();

  let healthy = false;
  let detail = "";

  try {
    const res = UrlFetchApp.fetch(SITE_URL + "/api/email/sync/status", {
      method: "get",
      headers: { "x-cron-secret": CRON_SECRET },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200) {
      detail = "Status endpoint returned HTTP " + code + ": " + res.getContentText().slice(0, 200);
    } else {
      const data = JSON.parse(res.getContentText());
      if (!data.lastSyncedAt) {
        detail = "No sync has ever been recorded.";
      } else {
        const ageMin = Math.round((Date.now() - new Date(data.lastSyncedAt).getTime()) / 60000);
        if (ageMin > STALE_MINUTES) {
          detail = "Last successful sync was " + ageMin + " minutes ago (threshold " + STALE_MINUTES + ").";
        } else {
          healthy = true;
          detail = "Last sync " + ageMin + " min ago.";
        }
      }
    }
  } catch (err) {
    detail = "Could not reach the status endpoint: " + err;
  }

  const wasAlerted = props.getProperty("alerted") === "true";

  if (healthy) {
    console.log("Sync healthy. " + detail);
    if (wasAlerted) {
      MailApp.sendEmail(
        recipient,
        "✅ TurfPay sync recovered",
        "The Gmail→TurfPay booking sync is working again.\n\n" + detail
      );
      props.deleteProperty("alerted");
      props.deleteProperty("lastAlertMs");
    }
    return;
  }

  // Unhealthy — alert, but throttle repeat alerts.
  console.error("Sync UNHEALTHY: " + detail);
  const lastAlertMs = Number(props.getProperty("lastAlertMs") || 0);
  const cooldownMs = ALERT_COOLDOWN_HOURS * 3600 * 1000;
  if (!wasAlerted || Date.now() - lastAlertMs > cooldownMs) {
    MailApp.sendEmail(
      recipient,
      "🚨 TurfPay booking sync is DOWN",
      "The Gmail→TurfPay booking sync has stopped working. New Khelomore " +
        "bookings may not be appearing on the site.\n\n" +
        detail +
        "\n\nCheck: the syncTurfPay Apps Script trigger, Vercel deployment/crons, " +
        "and that the Vercel account/card is active."
    );
    props.setProperty("alerted", "true");
    props.setProperty("lastAlertMs", String(Date.now()));
  }
}
