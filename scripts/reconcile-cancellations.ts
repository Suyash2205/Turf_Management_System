import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../src/lib/db";
import {
  parseKhelomoreModificationBookings,
  parseBookingId,
  khelomoreChangeEmailSubjectQuery,
} from "../src/lib/email-parser";
import { applyKhelomoreBookingChanges } from "../src/lib/cancelled-bookings";

// Applies all outstanding Khelomore cancellations to the CURRENT booking set,
// cheaply: only bookings that still exist are considered, only the latest change
// email per booking is downloaded, and registry/audit writes are skipped.
//   DRY=1  -> report scope only, ZERO write operations.
const DRY = process.env.DRY === "1";
const DAYS = parseInt(process.env.RECONCILE_DAYS || "220", 10);

function fmt(d: Date) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  // 1 read: all email-sourced bookings -> which externalId bases still exist.
  const bookings = await prisma.booking.findMany({
    where: { NOT: { emailMessageId: { startsWith: "manual:" } }, externalId: { not: null } },
    select: { externalId: true },
  });
  const presentBases = new Set(
    bookings.map((b) => (b.externalId || "").split("#")[0]).filter(Boolean)
  );
  console.log(`Bookings in DB: ${bookings.length} | distinct externalId bases present: ${presentBases.size}`);

  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST!, port: 993, secure: true,
    auth: { user: process.env.EMAIL_IMAP_USER!, pass: process.env.EMAIL_IMAP_PASSWORD! },
    logger: false, greetingTimeout: 20000, socketTimeout: 60000,
  });
  client.on("error", (e) => console.error("IMAP error:", e instanceof Error ? e.message : e));

  const latestByBase = new Map<string, { uid: number; date: Date; subject: string }>();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(); since.setDate(since.getDate() - DAYS);
    let q = `from:info@khelomore.com ${khelomoreChangeEmailSubjectQuery()}`;
    const venue = process.env.KHELOMORE_VENUE_NAME?.trim();
    if (venue) q += ` "${venue}"`;
    q += ` after:${fmt(since)}`;
    const uids = await client.search({ gmailraw: q }, { uid: true });
    console.log(`Change emails found: ${uids?.length ?? 0}`);

    // Envelopes only (cheap): pick the latest change email per externalId base that still exists.
    let relevant = 0;
    for await (const m of client.fetch(uids || [], { envelope: true }, { uid: true })) {
      const subject = m.envelope?.subject || "";
      const base = (parseBookingId(subject, "") || "").split("#")[0];
      if (!base || !presentBases.has(base)) continue;
      relevant++;
      const date = m.envelope?.date || new Date(0);
      const prev = latestByBase.get(base);
      if (!prev || date.getTime() > prev.date.getTime()) {
        latestByBase.set(base, { uid: m.uid!, date, subject });
      }
    }
    console.log(`Change emails matching an existing booking: ${relevant}`);
    console.log(`Distinct bookings (externalId) to reconcile: ${latestByBase.size}`);

    if (DRY) {
      console.log("\nDRY RUN — no writes. Estimated write scope ≈ per-booking trims/deletes only.");
      return;
    }

    // Download bodies only for the latest email per affected booking, then apply.
    const uidsToFetch = [...latestByBase.values()].map((v) => v.uid);
    const byUid = new Map([...latestByBase.entries()].map(([base, v]) => [v.uid, { base, subject: v.subject }]));
    let removed = 0, updated = 0, processed = 0;
    for await (const m of client.fetch(uidsToFetch, { source: true }, { uid: true })) {
      const meta = byUid.get(m.uid!);
      if (!meta) continue;
      const parsed = await simpleParser(m.source!);
      const body = parsed.html || parsed.text || "";
      const mod = parseKhelomoreModificationBookings(meta.subject, body);
      if (!mod) continue;
      const result = await applyKhelomoreBookingChanges(meta.base, mod, {
        source: "cancelled-history-script",
        disableAudit: true,
        skipRegistry: true,
      });
      removed += result.removed;
      updated += result.updated;
      if (++processed % 25 === 0) console.log(`  processed ${processed}/${uidsToFetch.length} (removed ${removed}, trimmed ${updated})`);
    }
    console.log(`\nDone. Processed ${processed} bookings | removed ${removed} | trimmed ${updated}`);
  } finally {
    lock.release();
    await client.logout();
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
