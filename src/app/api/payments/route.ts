import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateBookingStatus } from "@/lib/bookings";
import { extractPaymentFromImage } from "@/lib/ocr";
import { PaymentMethod, VerificationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    if (method === "ONLINE" && (!proofImage || proofImage.size === 0)) {
      return NextResponse.json(
        { error: "Payment screenshot is required for online payments" },
        { status: 400 }
      );
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
          { access: "public", contentType: proofImage.type || "image/jpeg" }
        );
        proofImageUrl = blob.url;
      } else {
        // Keep base64 fallback small enough for serverless + DB
        if (buffer.length > 2_000_000) {
          return NextResponse.json(
            { error: "Image too large. Please use a smaller screenshot." },
            { status: 400 }
          );
        }
        proofImageUrl = `data:${proofImage.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
      }

      // OCR is slow on serverless; opt-in only. Payment is always saved with the image.
      if (process.env.ENABLE_PAYMENT_OCR === "true") {
        try {
          const ocr = await extractPaymentFromImage(buffer, 5000);
          extractedSenderName = ocr.senderName;
          extractedAmount = ocr.amount;
        } catch {
          // OCR is best-effort
        }
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
  } catch (error) {
    console.error("Payment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record payment" },
      { status: 500 }
    );
  }
}
