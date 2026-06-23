import bcrypt from "bcryptjs";
import type { PrismaClient, UserRole } from "@prisma/client";

export type DefaultUser = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

const USER_DEFINITIONS: Omit<DefaultUser, "password">[] = [
  { email: "admin@turfpay.com", name: "Admin", role: "ADMIN" },
  { email: "staff@turfpay.com", name: "Ground Staff", role: "STAFF" },
  { email: "hitesh@turfpay.com", name: "Hitesh", role: "STAFF" },
  { email: "saba@turfpay.com", name: "Saba", role: "STAFF" },
  { email: "rumana@turfpay.com", name: "Rumana", role: "STAFF" },
  { email: "shanawaz@turfpay.com", name: "Shanawaz", role: "STAFF" },
  { email: "yogita@turfpay.com", name: "Yogita", role: "ADMIN" },
  { email: "sunil@turfpay.com", name: "Sunil", role: "ADMIN" },
  { email: "suyash@turfpay.com", name: "Suyash", role: "ADMIN" },
  { email: "nitesh@turfpay.com", name: "Nitesh", role: "ADMIN" },
  { email: "vivek@turfpay.com", name: "Vivek", role: "ADMIN" },
];

const PASSWORD_ENV_KEYS: Record<string, string> = {
  "admin@turfpay.com": "SEED_PASSWORD_ADMIN",
  "staff@turfpay.com": "SEED_PASSWORD_STAFF",
  "hitesh@turfpay.com": "SEED_PASSWORD_HITESH",
  "saba@turfpay.com": "SEED_PASSWORD_SABA",
  "rumana@turfpay.com": "SEED_PASSWORD_RUMANA",
  "shanawaz@turfpay.com": "SEED_PASSWORD_SHANAWAZ",
  "yogita@turfpay.com": "SEED_PASSWORD_YOGITA",
  "sunil@turfpay.com": "SEED_PASSWORD_SUNIL",
  "suyash@turfpay.com": "SEED_PASSWORD_SUYASH",
  "nitesh@turfpay.com": "SEED_PASSWORD_NITESH",
  "vivek@turfpay.com": "SEED_PASSWORD_VIVEK",
};

function getSeedPassword(email: string): string {
  const envKey = PASSWORD_ENV_KEYS[email.toLowerCase()];
  const password = envKey ? process.env[envKey] : undefined;

  if (!password) {
    throw new Error(
      `Missing ${envKey} for ${email}. Set seed passwords in environment variables only — never commit them to git.`
    );
  }

  return password;
}

export function getDefaultUsers(): DefaultUser[] {
  return USER_DEFINITIONS.map((user) => ({
    ...user,
    email: user.email.toLowerCase(),
    password: getSeedPassword(user.email),
  }));
}

export async function upsertDefaultUsers(prisma: PrismaClient) {
  const users = getDefaultUsers();

  for (const user of users) {
    const password = await bcrypt.hash(user.password, 12);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        password,
        name: user.name,
        role: user.role,
      },
      create: {
        email: user.email,
        password,
        name: user.name,
        role: user.role,
      },
    });
  }

  return users;
}
