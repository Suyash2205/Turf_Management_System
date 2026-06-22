import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { prisma } from "../src/lib/db";
import { recalculateBookingStatus } from "../src/lib/bookings";

async function main() {
  const bookings = await prisma.booking.findMany({
    select: { id: true, customerName: true },
  });

  for (const booking of bookings) {
    await recalculateBookingStatus(booking.id);
  }

  console.log(`Recalculated payment status for ${bookings.length} booking(s).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
