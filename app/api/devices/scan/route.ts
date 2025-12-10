import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

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
    const { deviceName, pondId, deviceType = "SENSOR" } = body;

    if (!deviceName || !pondId) {
      return NextResponse.json(
        { error: "Device name and pond are required" },
        { status: 400 }
      );
    }

    const pond = await prisma.pond.findFirst({
      where: { id: parseInt(pondId), userId: user.id },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found or access denied" },
        { status: 404 }
      );
    }

    // Check if device already exists by name
    const existingDbDevice = await prisma.device.findFirst({
      where: { name: deviceName },
      include: { pond: true, userDevices: true },
    });

    // Case 1: Device exists - add current user to it
    if (existingDbDevice) {
      // Check if user already has access to this device
      const userAlreadyHasDevice = await prisma.userDevice.findFirst({
        where: {
          userId: user.id,
          deviceId: existingDbDevice.id,
        },
      });

      if (userAlreadyHasDevice) {
        return NextResponse.json(
          { error: "You already have access to this device" },
          { status: 409 }
        );
      }

      // Add user to existing device
      try {
        await prisma.userDevice.create({
          data: {
            userId: user.id,
            deviceId: existingDbDevice.id,
          },
        });

        return NextResponse.json({
          success: true,
          isExisting: true,
          data: {
            id: existingDbDevice.id,
            name: existingDbDevice.name,
            deviceToken: existingDbDevice.deviceToken,
            thingsboardDeviceId: existingDbDevice.thingsboardDeviceId,
            pondId: existingDbDevice.pondId,
            pondName: existingDbDevice.pond.name,
            deviceType: existingDbDevice.deviceType,
            createdAt: existingDbDevice.createdAt,
            message: `Device added to your account. Previously registered by ${existingDbDevice.userDevices.length} other user(s)`,
          },
        });
      } catch (error) {
        console.error("Error adding user to existing device:", error);
        return NextResponse.json(
          { error: "Failed to add device to your account" },
          { status: 500 }
        );
      }
    }

    // Case 2: Device doesn't exist - create new device
    const existingTbDevice =
      await thingsboardService.findDeviceByName(deviceName);
    if (existingTbDevice) {
      return NextResponse.json(
        {
          error: `Device with name "${deviceName}" already exists in ThingsBoard`,
        },
        { status: 409 }
      );
    }

    let tbDevice;
    try {
      tbDevice = await thingsboardService.createDevice(
        deviceName,
        deviceType.toLowerCase(),
        `${deviceName} - ${pond.name}`
      );
      console.log("ThingsBoard device created:", tbDevice);
    } catch (error) {
      console.error("ThingsBoard device creation error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to create device in ThingsBoard",
        },
        { status: 500 }
      );
    }

    if (!tbDevice || !tbDevice.id) {
      return NextResponse.json(
        { error: "Invalid response from ThingsBoard" },
        { status: 500 }
      );
    }

    const tbDeviceId = tbDevice.id.id;

    let accessToken: string;
    try {
      accessToken = await thingsboardService.getDeviceAccessToken(tbDeviceId);
    } catch (error) {
      console.error("Failed to get device access token:", error);

      try {
        await thingsboardService.deleteDevice(tbDeviceId);
      } catch (cleanupError) {
        console.error("Failed to cleanup ThingsBoard device:", cleanupError);
      }
      return NextResponse.json(
        { error: "Failed to get device credentials from ThingsBoard" },
        { status: 500 }
      );
    }

    let device;
    try {
      device = await prisma.device.create({
        data: {
          pondId: pond.id,
          name: deviceName,
          deviceType,
          deviceToken: accessToken,
          thingsboardDeviceId: tbDeviceId,
          userDevices: {
            create: {
              userId: user.id,
            },
          },
        },
        include: {
          pond: true,
          userDevices: true,
        },
      });
    } catch (dbError) {
      console.error("Database device creation error:", dbError);

      try {
        await thingsboardService.deleteDevice(tbDeviceId);
      } catch (cleanupError) {
        console.error("Failed to cleanup ThingsBoard device:", cleanupError);
      }
      return NextResponse.json(
        { error: "Failed to save device to database" },
        { status: 500 }
      );
    }

    try {
      await thingsboardService.saveDeviceAttributes(tbDeviceId, {
        pondId: pond.id.toString(),
        pondName: pond.name,
        userId: user.id.toString(),
        registeredAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to save device attributes:", error);
    }

    return NextResponse.json({
      success: true,
      isExisting: false,
      data: {
        id: device.id,
        name: device.name,
        deviceToken: device.deviceToken,
        thingsboardDeviceId: device.thingsboardDeviceId,
        pondId: device.pondId,
        pondName: pond.name,
        deviceType: device.deviceType,
        createdAt: device.createdAt,
      },
    });
  } catch (error) {
    console.error("Device scan/creation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to register device",
      },
      { status: 500 }
    );
  }
}
