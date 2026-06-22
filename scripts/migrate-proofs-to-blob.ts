import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
import { put } from "@vercel/blob";
import { prisma } from "../src/lib/db";
import { isBase64ProofUrl } from "../src/lib/payment-proof";

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is required");
    process.exit(1);
  }

  const payments = await prisma.payment.findMany({
    where: { proofImageUrl: { not: null } },
    select: { id: true, bookingId: true, proofImageUrl: true },
  });

  const base64Payments = payments.filter((p) =>
    isBase64ProofUrl(p.proofImageUrl)
  );

  if (base64Payments.length === 0) {
    console.log("No base64 payment proofs to migrate.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Migrating ${base64Payments.length} proof(s) to Vercel Blob...`);

  for (const payment of base64Payments) {
    const url = payment.proofImageUrl!;
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      console.warn(`Skipping ${payment.id}: invalid data URL`);
      continue;
    }

    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";

    const blob = await put(
      `payment-proofs/${payment.bookingId}-${payment.id}.${ext}`,
      buffer,
      { access: "public", contentType }
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: { proofImageUrl: blob.url },
    });

    console.log(`Migrated ${payment.id} -> ${blob.url}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
