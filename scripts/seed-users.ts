import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_USERS, upsertDefaultUsers } from "../src/lib/default-users";

const prisma = new PrismaClient();

async function main() {
  await upsertDefaultUsers(prisma);

  console.log("Users seeded:");
  for (const user of DEFAULT_USERS) {
    console.log(`  ${user.role.padEnd(5)} ${user.email.toLowerCase()}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
