import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const bad = await prisma.booking.findMany({
    where: { customerName: { startsWith: "$" } },
    select: { id: true, externalId: true },
  });

  for (const booking of bad) {
    const suffix = booking.externalId?.split("-").pop() || "booking";
    const name = `Guest (${suffix})`;
    await prisma.booking.update({
      where: { id: booking.id },
      data: { customerName: name },
    });
    console.log(`Updated ${booking.externalId} -> ${name}`);
  }

  console.log(`Fixed ${bad.length} booking(s)`);
  await prisma.$disconnect();
}

main();
