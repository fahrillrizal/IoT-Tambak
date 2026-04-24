import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PERIOD_TO_DAYS: Record<string, number> = {
  "7days": 7,
  "30days": 30,
  "90days": 90,
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const period = searchParams.get("period") || "7days";
    const days = PERIOD_TO_DAYS[period] || 7;

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
      select: {
        id: true,
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const alerts = await prisma.alertEvent.findMany({
      where: {
        deviceId: device.id,
        eventTime: {
          gte: startDate,
        },
        severity: {
          in: ["WARNING", "CRITICAL"],
        },
      },
      orderBy: {
        eventTime: "desc",
      },
      take: 500,
      select: {
        id: true,
        tbAlarmId: true,
        severity: true,
        status: true,
        message: true,
        issueCount: true,
        parameters: true,
        action: true,
        eventTime: true,
        createdAt: true,
      },
    });

    const activeWarnings = alerts.filter(
      (item) => item.severity === "WARNING" && item.status === "ACTIVE"
    );
    const activeCritical = alerts.filter(
      (item) => item.severity === "CRITICAL" && item.status === "ACTIVE"
    );

    return NextResponse.json({
      success: true,
      data: alerts.map((item) => ({
        id: item.id.toString(),
        tbAlarmId: item.tbAlarmId,
        severity: item.severity,
        status: item.status,
        message: item.message,
        issueCount: item.issueCount,
        parameters: item.parameters,
        action: item.action,
        eventTime: item.eventTime.toISOString(),
        createdAt: item.createdAt.toISOString(),
      })),
      summary: {
        total: alerts.length,
        activeWarning: activeWarnings.length,
        activeCritical: activeCritical.length,
        activeTotal: activeWarnings.length + activeCritical.length,
      },
    });
  } catch (error) {
    console.error("History alerts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history alerts" },
      { status: 500 }
    );
  }
}
