import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { proofImageUrl: true },
  });

  if (!payment?.proofImageUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (payment.proofImageUrl.startsWith("data:")) {
    const match = payment.proofImageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }
    const buffer = Buffer.from(match[2], "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return NextResponse.redirect(payment.proofImageUrl);
}
