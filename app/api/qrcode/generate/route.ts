import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQRCode } from "@/lib/qrcode-generator";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: deviceId,
        OR: [
          {
            pond: {
              userId: user.id,
            },
          },
          {
            userDevices: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const requestUrl = new URL(request.url);
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${requestUrl.protocol}//${requestUrl.host}`;
    const claimUrl = `${baseUrl.replace(/\/$/, "")}/claim?deviceId=${encodeURIComponent(
      deviceId
    )}`;

    const qrDataUrl = await generateQRCode(claimUrl);

    return NextResponse.json({
      success: true,
      data: {
        qrCode: qrDataUrl,
        deviceId: deviceId,
        deviceName: device.name,
        claimUrl,
      },
    });
  } catch (error) {
    console.error("QR code generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
