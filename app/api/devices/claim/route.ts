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

    // For claim endpoint, we allow ANY user to see device info when they have the deviceId
    // This is because they received it via QR code (which is a form of authorization)
    // The actual access control will happen on assign (PUT request)
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

    // Check if user already has access to this device
    const userAlreadyHasAccess =
      device.pond.userId === user.id ||
      device.userDevices.some((ud) => ud.userId === user.id);

    if (userAlreadyHasAccess) {
      // User already owns or has access to this device
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

    // Device found but user doesn't have access yet - this is a new claim
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
        ownerEmail: undefined, // Don't reveal owner email for security
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

    // Get the device - no access control here yet, we verify below
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
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    // Check authorization: User must be owner OR already have access
    const isOwner = device.pond.userId === user.id;
    const hasAccess = device.userDevices.some((ud) => ud.userId === user.id);
    const isAuthorized = isOwner || hasAccess;

    // Get target pond
    const pond = await prisma.pond.findFirst({
      where: { id: parseInt(pondId, 10), userId: user.id, isActive: true },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found or access denied" },
        { status: 404 }
      );
    }

    // Authorization rules:
    // 1. Owner can assign to any pond
    // 2. Non-owner with access can only assign to their own pond
    if (!isOwner && pond.id !== device.pondId) {
      return NextResponse.json(
        {
          error:
            "Anda hanya bisa assign device ke kolam yang sama. Hubungi pemilik device untuk memindahkan ke kolam lain.",
        },
        { status: 403 }
      );
    }

    // If user doesn't have access yet, add them
    if (!hasAccess) {
      await prisma.userDevice.create({
        data: {
          userId: user.id,
          deviceId: device.id,
        },
      });
    }

    // Only update pond if it's different
    if (device.pondId !== pond.id) {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          pondId: pond.id,
          updatedAt: new Date(),
        },
      });
      // Re-fetch device after update
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
