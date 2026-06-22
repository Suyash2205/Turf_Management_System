import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalculateBookingStatus } from "@/lib/bookings";
import { canDeletePayment, canModifyPayment } from "@/lib/payment-access";
import { extractPaymentFromImage } from "@/lib/ocr";
import { PaymentMethod, VerificationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function uploadProof(
  bookingId: string,
  paymentId: string,
  proofImage: File
) {
  const buffer = Buffer.from(await proofImage.arrayBuffer());

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Image storage not configured");
  }

  const blob = await put(
    `payment-proofs/${bookingId}-${paymentId}-${Date.now()}.${proofImage.name.split(".").pop() || "jpg"}`,
    buffer,
    { access: "public", contentType: proofImage.type || "image/jpeg" }
  );

  return { url: blob.url, buffer };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (!canModifyPayment(session.user.role, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const amountRaw = formData.get("amount");
    const methodRaw = formData.get("method");
    const proofImage = formData.get("proofImage") as File | null;

    const data: {
      amount?: number;
      method?: PaymentMethod;
      proofImageUrl?: string;
      extractedSenderName?: string | null;
      extractedAmount?: number | null;
      verificationStatus?: VerificationStatus;
    } = {};

    if (amountRaw != null && amountRaw !== "") {
      const amount = parseFloat(amountRaw as string);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      data.amount = amount;
    }

    if (methodRaw) {
      const method = methodRaw as PaymentMethod;
      if (!["CASH", "ONLINE"].includes(method)) {
        return NextResponse.json({ error: "Invalid method" }, { status: 400 });
      }
      data.method = method;
    }

    const nextMethod = data.method ?? existing.method;
    if (nextMethod === "ONLINE" && proofImage && proofImage.size > 0) {
      const { url, buffer } = await uploadProof(
        existing.bookingId,
        existing.id,
        proofImage
      );
      data.proofImageUrl = url;

      if (process.env.ENABLE_PAYMENT_OCR === "true") {
        try {
          const ocr = await extractPaymentFromImage(buffer, 5000);
          data.extractedSenderName = ocr.senderName;
          data.extractedAmount = ocr.amount;
        } catch {
          // OCR is best-effort
        }
      }
    } else if (nextMethod === "ONLINE" && !existing.proofImageUrl && !proofImage) {
      return NextResponse.json(
        { error: "Payment screenshot is required for online payments" },
        { status: 400 }
      );
    }

    if (
      existing.verificationStatus === VerificationStatus.REJECTED ||
      existing.verificationStatus === VerificationStatus.PENDING
    ) {
      data.verificationStatus = VerificationStatus.PENDING;
    }

    const payment = await prisma.payment.update({
      where: { id },
      data,
    });

    await recalculateBookingStatus(payment.bookingId);

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Payment update error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update payment",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (!canDeletePayment(session.user.role, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.payment.delete({ where: { id } });
  await recalculateBookingStatus(existing.bookingId);

  return NextResponse.json({ success: true });
}
