import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { deviceId, userEmail } = body;

    if (!deviceId || !userEmail) {
      return NextResponse.json(
        { error: "Device ID and user email are required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(deviceId),
        pond: {
          userId: user.id,
        },
      },
      include: { pond: true },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.id === user.id) {
      return NextResponse.json(
        { error: "Cannot share device with yourself" },
        { status: 400 }
      );
    }

    const existingShare = await prisma.userDevice.findFirst({
      where: {
        userId: targetUser.id,
        deviceId: device.id,
      },
    });

    if (existingShare) {
      return NextResponse.json(
        { error: "Device already shared with this user" },
        { status: 409 }
      );
    }

    await prisma.userDevice.create({
      data: {
        userId: targetUser.id,
        deviceId: device.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Device "${device.name}" shared with ${userEmail}`,
      data: {
        deviceId: device.id,
        deviceName: device.name,
        sharedWith: userEmail,
      },
    });
  } catch (error) {
    console.error("Device share error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to share device",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const userEmail = searchParams.get("userEmail");

    if (!deviceId || !userEmail) {
      return NextResponse.json(
        { error: "Device ID and user email are required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(deviceId),
        pond: {
          userId: user.id,
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.userDevice.deleteMany({
      where: {
        userId: targetUser.id,
        deviceId: device.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Device access removed for ${userEmail}`,
      data: {
        deviceId: device.id,
        deviceName: device.name,
        removedFrom: userEmail,
      },
    });
  } catch (error) {
    console.error("Device unshare error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove device access",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(deviceId),
        pond: {
          userId: user.id,
        },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const sharedUsers = await prisma.userDevice.findMany({
      where: {
        deviceId: device.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: sharedUsers.map((su) => ({
        userId: su.user.id,
        email: su.user.email,
        name: su.user.name,
        sharedAt: su.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get share list error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get share list",
      },
      { status: 500 }
    );
  }
}
