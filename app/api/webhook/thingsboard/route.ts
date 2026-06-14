import { NextRequest, NextResponse } from "next/server";
import { pusher, triggerDeviceStatusUpdate } from "@/lib/pusher";
import { prisma } from "@/lib/db";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (querySecret !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const deviceId = searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const body = await request.json();

    const telemetryKeys = [
      "temperature",
      "ph",
      "dissolvedOxygen",
      "salinity",
      "turbidity",
    ];
    const telemetryData: Record<string, number> = {};

    for (const key of telemetryKeys) {
      const value = body[key];
      if (value !== undefined && value !== null) {
        const num =
          typeof value === "number" ? value : parseFloat(String(value));
        if (!isNaN(num)) telemetryData[key] = num;
      }
    }

    if (Object.keys(telemetryData).length === 0) {
      return NextResponse.json({ success: true, message: "No telemetry" });
    }

    // Update lastHeartbeat and mark device as ACTIVE when receiving telemetry
    const device = await prisma.device.findFirst({
      where: { thingsboardDeviceId: deviceId },
      select: { id: true, deviceStatus: true },
    });

    if (device) {
      const wasOffline = device.deviceStatus !== "ACTIVE";
      
      await prisma.device.update({
        where: { id: device.id },
        data: {
          lastHeartbeat: new Date(),
          deviceStatus: "ACTIVE",
        },
      });

      // If device was offline, notify clients it's now online
      if (wasOffline) {
        console.log(`📡 Device ${deviceId} is now ONLINE`);
        await triggerDeviceStatusUpdate(deviceId, true);
      }
    }

    const payload = {
      deviceId,
      ...telemetryData,
      timestamp: Date.now(),
    };

    await Promise.all([
      pusher.trigger(`device-${deviceId}`, "telemetry-update", payload),
      pusher.trigger("global-telemetry", "telemetry-update", payload),
    ]);

    return NextResponse.json({
      success: true,
      deviceId,
      telemetry: telemetryData,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
