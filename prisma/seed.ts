import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const staffPassword = await bcrypt.hash("staff123", 12);

  await prisma.user.upsert({
    where: { email: "admin@turfpay.com" },
    update: { password: adminPassword, name: "Admin", role: "ADMIN" },
    create: {
      email: "admin@turfpay.com",
      password: adminPassword,
      name: "Admin",
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "staff@turfpay.com" },
    update: { password: staffPassword, name: "Ground Staff", role: "STAFF" },
    create: {
      email: "staff@turfpay.com",
      password: staffPassword,
      name: "Ground Staff",
      role: "STAFF",
    },
  });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  await prisma.booking.upsert({
    where: { externalId: "DEMO-001" },
    update: {},
    create: {
      externalId: "DEMO-001",
      customerName: "Rahul Sharma",
      customerPhone: "9876543210",
      bookingDate: today,
      startTime: "6:00 PM",
      endTime: "7:00 PM",
      totalAmount: 1800,
      paidOnKhelomore: false,
      paymentStatus: "PENDING",
    },
  });

  await prisma.booking.upsert({
    where: { externalId: "DEMO-002" },
    update: {},
    create: {
      externalId: "DEMO-002",
      customerName: "Priya Patel",
      customerPhone: "9123456789",
      bookingDate: today,
      startTime: "7:00 PM",
      endTime: "8:00 PM",
      totalAmount: 2000,
      paidOnKhelomore: true,
      paymentStatus: "COMPLETED",
    },
  });

  await prisma.booking.upsert({
    where: { externalId: "DEMO-003" },
    update: {},
    create: {
      externalId: "DEMO-003",
      customerName: "Amit Kumar",
      customerPhone: "9988776655",
      bookingDate: tomorrow,
      startTime: "5:00 PM",
      endTime: "6:00 PM",
      totalAmount: 1500,
      paidOnKhelomore: false,
      paymentStatus: "PENDING",
    },
  });

  console.log("Seed completed!");
  console.log("Admin: admin@turfpay.com / admin123");
  console.log("Staff: staff@turfpay.com / staff123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
