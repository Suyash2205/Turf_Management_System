import bcrypt from "bcryptjs";
import type { PrismaClient, UserRole } from "@prisma/client";

export type DefaultUser = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

export const DEFAULT_USERS: DefaultUser[] = [
  {
    email: "admin@turfpay.com",
    password: "admin123",
    name: "Admin",
    role: "ADMIN",
  },
  {
    email: "staff@turfpay.com",
    password: "staff123",
    name: "Ground Staff",
    role: "STAFF",
  },
  {
    email: "hitesh@turfpay.com",
    password: "Hitesh@123",
    name: "Hitesh",
    role: "STAFF",
  },
  {
    email: "yogita@turfpay.com",
    password: "Yogita@123",
    name: "Yogita",
    role: "ADMIN",
  },
  {
    email: "sunil@turfpay.com",
    password: "Sunil@123",
    name: "Sunil",
    role: "ADMIN",
  },
  {
    email: "suyash@turfpay.com",
    password: "Suyash@123",
    name: "Suyash",
    role: "ADMIN",
  },
];

export async function upsertDefaultUsers(prisma: PrismaClient) {
  for (const user of DEFAULT_USERS) {
    const email = user.email.toLowerCase();
    const password = await bcrypt.hash(user.password, 12);

    await prisma.user.upsert({
      where: { email },
      update: {
        password,
        name: user.name,
        role: user.role,
      },
      create: {
        email,
        password,
        name: user.name,
        role: user.role,
      },
    });
  }
}
