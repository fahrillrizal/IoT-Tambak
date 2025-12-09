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

    const existingDevice =
      await thingsboardService.findDeviceByName(deviceName);
    if (existingDevice) {
      return NextResponse.json(
        {
          error: `Device with name "${deviceName}" already exists in ThingsBoard`,
        },
        { status: 409 }
      );
    }

    const existingDbDevice = await prisma.device.findFirst({
      where: { name: deviceName },
    });
    if (existingDbDevice) {
      return NextResponse.json(
        { error: `Device with name "${deviceName}" already exists` },
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
        },
        include: {
          pond: true,
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
