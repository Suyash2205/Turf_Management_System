import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateBookingStatus } from "@/lib/bookings";
import { extractPaymentFromImage } from "@/lib/ocr";
import { PaymentMethod, VerificationStatus } from "@prisma/client";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const bookingId = formData.get("bookingId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const method = formData.get("method") as PaymentMethod;
  const proofImage = formData.get("proofImage") as File | null;

  if (!bookingId || !amount || !method) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!["CASH", "ONLINE"].includes(method)) {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let proofImageUrl: string | undefined;
  let extractedSenderName: string | null = null;
  let extractedAmount: number | null = null;

  if (method === "ONLINE" && proofImage && proofImage.size > 0) {
    const buffer = Buffer.from(await proofImage.arrayBuffer());

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `payment-proofs/${bookingId}-${Date.now()}.${proofImage.name.split(".").pop() || "jpg"}`,
        buffer,
        { access: "public", contentType: proofImage.type }
      );
      proofImageUrl = blob.url;
    } else {
      const base64 = buffer.toString("base64");
      proofImageUrl = `data:${proofImage.type};base64,${base64}`;
    }

    try {
      const ocr = await extractPaymentFromImage(buffer);
      extractedSenderName = ocr.senderName;
      extractedAmount = ocr.amount;
    } catch {
      // OCR is best-effort; payment still gets recorded
    }
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      amount,
      method,
      proofImageUrl,
      extractedSenderName,
      extractedAmount,
      verificationStatus: VerificationStatus.PENDING,
      recordedById: session.user.id,
    },
  });

  await recalculateBookingStatus(bookingId);

  return NextResponse.json(payment, { status: 201 });
}
