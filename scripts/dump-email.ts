import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

function normalizeEmailBody(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  const uid = parseInt(process.argv[2] || "139424", 10);
  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST!,
    port: 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_IMAP_USER!,
      pass: process.env.EMAIL_IMAP_PASSWORD!,
    },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch(
      [uid],
      { source: true, envelope: true },
      { uid: true }
    )) {
      const parsed = await simpleParser(msg.source!);
      const text = normalizeEmailBody(parsed.html || parsed.text || "");
      console.log("=== NORMALIZED TEXT ===");
      console.log(text);
      console.log("\n=== BOOKING DETAILS SECTION ===");
      const section = text.match(
        /Booking Details([\s\S]*?)(?:Slot Details|Bill Details|$)/i
      )?.[1];
      console.log(section || "(not found)");
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main();
