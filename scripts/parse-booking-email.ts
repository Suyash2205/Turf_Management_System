import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseKhelomoreEmails } from "../src/lib/email-parser";

async function main() {
  const externalId = process.argv[2] || "2026-271-URVX";
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
    const uids = await client.search(
      { gmailraw: `from:info@khelomore.com subject:"${externalId}"` },
      { uid: true }
    );
    for await (const msg of client.fetch(uids!, { source: true, envelope: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source!);
      const body = parsed.html || parsed.text || "";
      const subject = parsed.subject || msg.envelope?.subject || "";
      const result = parseKhelomoreEmails(subject, body);
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main();
