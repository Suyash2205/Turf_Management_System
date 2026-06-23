import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const TEAM_USERS = [
  {
    email: "saba@turfpay.com",
    name: "Saba",
    role: "STAFF" as const,
    envKey: "SEED_PASSWORD_SABA",
  },
  {
    email: "rumana@turfpay.com",
    name: "Rumana",
    role: "STAFF" as const,
    envKey: "SEED_PASSWORD_RUMANA",
  },
  {
    email: "shanawaz@turfpay.com",
    name: "Shanawaz",
    role: "STAFF" as const,
    envKey: "SEED_PASSWORD_SHANAWAZ",
  },
  {
    email: "nitesh@turfpay.com",
    name: "Nitesh",
    role: "ADMIN" as const,
    envKey: "SEED_PASSWORD_NITESH",
  },
  {
    email: "vivek@turfpay.com",
    name: "Vivek",
    role: "ADMIN" as const,
    envKey: "SEED_PASSWORD_VIVEK",
  },
];

const prisma = new PrismaClient();

async function main() {
  for (const user of TEAM_USERS) {
    const password = process.env[user.envKey];
    if (!password) {
      throw new Error(`Missing ${user.envKey} for ${user.email}`);
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { password: hash, name: user.name, role: user.role },
      create: {
        email: user.email,
        password: hash,
        name: user.name,
        role: user.role,
      },
    });

    console.log(`  ${user.role.padEnd(5)} ${user.email}`);
  }

  console.log("\nTeam users created/updated.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
