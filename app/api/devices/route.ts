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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const devices = await prisma.device.findMany({
      where: {
        pond: {
          userId: user.id,
        },
        isActive: true,
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

    
    const enrichedDevices = await Promise.all(
      devices.map(async (device) => {
        let isOnline = false;

        if (device.thingsboardDeviceId) {
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 3000)
            );

            const telemetryPromise = thingsboardService.getDeviceTelemetry(
              device.thingsboardDeviceId
            );

            const telemetry = (await Promise.race([
              telemetryPromise,
              timeoutPromise,
            ])) as Record<string, any[]>;

            if (telemetry && typeof telemetry === "object") {
              const keys = Object.keys(telemetry);
              if (keys.length > 0) {
                // Set online only if telemetry timestamp is within last 5 minutes
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                isOnline = keys.some((key) => {
                  const values = telemetry[key];
                  if (Array.isArray(values) && values.length > 0) {
                    const latestTs = values[0]?.ts || 0;
                    return latestTs > fiveMinutesAgo;
                  }
                  return false;
                });
              }
            }
          } catch (err) {
            isOnline = false;
            console.error(
              `Telemetry fetch failed for device ${device.id}:`,
              err instanceof Error ? err.message : "Unknown error"
            );
          }
        }

        
        // Update deviceStatus in DB to reflect online/offline
        const desiredStatus = isOnline ? "ACTIVE" : "INACTIVE";
        if (device.deviceStatus !== desiredStatus) {
          try {
            await prisma.device.update({
              where: { id: device.id },
              data: { deviceStatus: desiredStatus },
            });
          } catch (updateErr) {
            console.error(`Failed to update device status for ${device.id}:`, updateErr);
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
          pondId: device.pond.id,
          pondName: device.pond.name,
          notifications: 0, 
          createdAt: device.createdAt.toISOString(),
          updatedAt: device.updatedAt.toISOString(),
        };
      })
    );

    
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
