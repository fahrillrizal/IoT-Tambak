import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

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
        pond: {
          userId: user.id,
        },
      },
      include: {
        pond: { select: { id: true, name: true } },
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        thingsboardDeviceId: device.thingsboardDeviceId,
        pondId: device.pond.id,
        pondName: device.pond.name,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      },
    });
  } catch (error) {
    console.error("Device claim fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch claimed device",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { deviceId, pondId } = body;

    if (!deviceId || !pondId) {
      return NextResponse.json(
        { error: "Device ID and pond are required" },
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

    const pond = await prisma.pond.findFirst({
      where: { id: parseInt(pondId, 10), userId: user.id, isActive: true },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found or access denied" },
        { status: 404 }
      );
    }

    const updatedDevice = await prisma.device.update({
      where: { id: device.id },
      data: {
        pondId: pond.id,
        updatedAt: new Date(),
      },
      include: {
        pond: { select: { id: true, name: true } },
      },
    });

    try {
      if (device.thingsboardDeviceId) {
        await thingsboardService.saveDeviceAttributes(device.thingsboardDeviceId, {
          pondId: pond.id.toString(),
          pondName: pond.name,
          userId: user.id.toString(),
          reassignedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Failed to update ThingsBoard attributes:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedDevice.id,
        name: updatedDevice.name,
        deviceType: updatedDevice.deviceType,
        thingsboardDeviceId: updatedDevice.thingsboardDeviceId,
        pondId: updatedDevice.pond.id,
        pondName: updatedDevice.pond.name,
        createdAt: updatedDevice.createdAt,
        updatedAt: updatedDevice.updatedAt,
      },
    });
  } catch (error) {
    console.error("Device claim update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign device" },
      { status: 500 }
    );
  }
}
