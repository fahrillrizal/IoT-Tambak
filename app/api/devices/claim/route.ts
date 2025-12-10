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
      },
      include: {
        pond: { select: { id: true, name: true, userId: true } },
        userDevices: { select: { userId: true } },
      },
    });

    if (!device) {
      console.warn("Device not found with thingsboardDeviceId:", deviceId);
      return NextResponse.json(
        {
          error:
            "Device tidak ditemukan. Pastikan Anda sudah scan/menambahkan device terlebih dahulu melalui menu Tambah Device.",
        },
        { status: 404 }
      );
    }

    const userAlreadyHasAccess =
      device.pond.userId === user.id ||
      device.userDevices.some((ud) => ud.userId === user.id);

    if (userAlreadyHasAccess) {
      return NextResponse.json({
        success: true,
        isExisting: true,
        data: {
          id: device.id,
          name: device.name,
          deviceType: device.deviceType,
          thingsboardDeviceId: device.thingsboardDeviceId,
          pondId: device.pond.id,
          pondName: device.pond.name,
          createdAt: device.createdAt,
          updatedAt: device.updatedAt,
          message: "You already have access to this device",
        },
      });
    }

    return NextResponse.json({
      success: true,
      isExisting: false,
      data: {
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        thingsboardDeviceId: device.thingsboardDeviceId,
        pondId: device.pond.id,
        pondName: device.pond.name,
        ownerEmail: undefined,
        message: `Device dimiliki user lain. Klik Assign untuk mengakses device ini.`,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      },
    });
  } catch (error) {
    console.error("Device claim fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch claimed device",
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

    let device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: deviceId,
      },
      include: {
        pond: true,
        userDevices: { select: { userId: true } },
      },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const isOwner = device.pond.userId === user.id;
    const hasAccess = device.userDevices.some((ud) => ud.userId === user.id);
    const isAuthorized = isOwner || hasAccess;

    const pond = await prisma.pond.findFirst({
      where: { id: parseInt(pondId, 10), userId: user.id, isActive: true },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found or access denied" },
        { status: 404 }
      );
    }

    if (!hasAccess) {
      await prisma.userDevice.create({
        data: {
          userId: user.id,
          deviceId: device.id,
        },
      });
    }

    if (device.pondId !== pond.id) {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          pondId: pond.id,
          updatedAt: new Date(),
        },
      });

      const updated = await prisma.device.findUnique({
        where: { id: device.id },
        include: {
          pond: true,
          userDevices: { select: { userId: true } },
        },
      });
      if (updated) {
        device = updated;
      }
    }

    try {
      if (device.thingsboardDeviceId) {
        await thingsboardService.saveDeviceAttributes(
          device.thingsboardDeviceId,
          {
            pondId: pond.id.toString(),
            pondName: pond.name,
            userId: user.id.toString(),
            claimedAt: new Date().toISOString(),
          }
        );
      }
    } catch (err) {
      console.error("Failed to update ThingsBoard attributes:", err);
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
    console.error("Device claim update error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to assign device",
      },
      { status: 500 }
    );
  }
}
