import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

/**
 * GET /api/telemetry/feeder?deviceId=<thingsboardDeviceId>
 * 
 * Returns the latest battery and sisaPakan (feed stock) telemetry
 * from ThingsBoard for the given device.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
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

    // Verify device ownership
    const device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: deviceId,
        OR: [
          { pond: { userId: user.id } },
          { userDevices: { some: { userId: user.id } } },
        ],
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    // Fetch feeder-specific telemetry keys from ThingsBoard
    const keys = ["battery", "sisaPakan", "feeding_done"];
    const latest = await thingsboardService.getDeviceTelemetry(deviceId, keys);

    const getLatestValue = (arr?: any[]) => {
      if (Array.isArray(arr) && arr.length > 0) {
        return parseFloat(arr[0].value);
      }
      return null;
    };

    const data = {
      battery: getLatestValue(latest.battery),
      sisaPakan: getLatestValue(latest.sisaPakan),
      feedingDone: getLatestValue(latest.feeding_done),
    };

    return NextResponse.json({
      success: true,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Feeder telemetry fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feeder telemetry" },
      { status: 500 }
    );
  }
}
