import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const OFFLINE_TIMEOUT_MS = 60 * 1000;

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

    const devices = await prisma.device.findMany({
      where: {
        isActive: true,
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
      include: {
        pond: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(
      "Found devices:",
      devices.map((d) => ({
        id: d.id,
        name: d.name,
        thingsboardDeviceId: d.thingsboardDeviceId,
      }))
    );

    const now = Date.now();
    const devicesToMarkOffline: number[] = [];
    const devicesToMarkOnline: number[] = [];

    const enrichedDevices = devices.map((device) => {
      let isOnline = false;

      if (device.lastHeartbeat) {
        const lastHeartbeatTime = device.lastHeartbeat.getTime();
        isOnline = now - lastHeartbeatTime < OFFLINE_TIMEOUT_MS;
      }

      const desiredStatus = isOnline ? "ACTIVE" : "INACTIVE";
      if (device.deviceStatus !== desiredStatus) {
        if (isOnline) {
          devicesToMarkOnline.push(device.id);
        } else {
          devicesToMarkOffline.push(device.id);
        }
      }

      return {
        id: device.id,
        name: device.name,
        deviceId: device.thingsboardDeviceId || "",
        thingsboardDeviceId: device.thingsboardDeviceId || "",
        deviceToken: device.deviceToken,
        deviceType: device.deviceType,
        isOnline,
        lastHeartbeat: device.lastHeartbeat?.toISOString() || null,
        pondId: device.pond.id,
        pondName: device.pond.name,
        notifications: 0,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      };
    });

    if (devicesToMarkOffline.length > 0) {
      await prisma.device.updateMany({
        where: { id: { in: devicesToMarkOffline } },
        data: { deviceStatus: "INACTIVE" },
      });
    }
    if (devicesToMarkOnline.length > 0) {
      await prisma.device.updateMany({
        where: { id: { in: devicesToMarkOnline } },
        data: { deviceStatus: "ACTIVE" },
      });
    }

    const validDevices = enrichedDevices.filter((d) => d.deviceId);

    console.log(
      "Returning devices:",
      validDevices.map((d) => ({
        id: d.id,
        name: d.name,
        deviceId: d.deviceId,
        isOnline: d.isOnline,
      }))
    );

    return NextResponse.json({
      success: true,
      data: validDevices,
      total: validDevices.length,
    });
  } catch (error) {
    console.error("Devices fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch devices",
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
    const deviceId = searchParams.get("id");

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findFirst({
      where: {
        id: parseInt(deviceId),
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
      include: { pond: true },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const deletedDevice = await prisma.device.update({
      where: { id: parseInt(deviceId) },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Device "${device.name}" has been deleted`,
      data: {
        id: deletedDevice.id,
        name: deletedDevice.name,
      },
    });
  } catch (error) {
    console.error("Device delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete device",
      },
      { status: 500 }
    );
  }
}
