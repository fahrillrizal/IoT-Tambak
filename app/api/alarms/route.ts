import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { thingsboardService } from "@/lib/thingsboard";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const status = searchParams.get("status") as any;
    const severity = searchParams.get("severity") as
      | "CRITICAL"
      | "WARNING"
      | "MAJOR"
      | "MINOR"
      | null;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "200"), 1),
      1000
    );

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const device = await prisma.device.findFirst({
      where: {
        thingsboardDeviceId: deviceId,
        OR: [
          { pond: { userId: user.id } },
          { userDevices: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const alarms = await thingsboardService.getDeviceAlarms(deviceId, {
      status,
      severity: severity || undefined,
      limit,
    });

    const transformedAlarms = (alarms.data || []).map((alarm: any) => ({
      id: alarm.id.id,
      type: alarm.type,
      severity: alarm.severity,
      status: alarm.status,
      message: alarm.details?.message || "",
      createdTime: alarm.createdTime,
      ackTime: alarm.ackTs,
      clearTime: alarm.clearTs,
      originator: alarm.originator,
    }));

    return NextResponse.json({
      success: true,
      data: transformedAlarms,
      total: alarms.totalElements || 0,
    });
  } catch (error) {
    console.error("Alarms fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alarms" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { alarmId, action } = body;

    if (!alarmId || !action) {
      return NextResponse.json(
        { error: "Alarm ID and action are required" },
        { status: 400 }
      );
    }

    if (action === "ack") {
      await thingsboardService.acknowledgeAlarm(alarmId);
    } else if (action === "clear") {
      await thingsboardService.clearAlarm(alarmId);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "ack" or "clear"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Alarm action error:", error);
    return NextResponse.json(
      { error: "Failed to process alarm action" },
      { status: 500 }
    );
  }
}
