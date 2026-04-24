import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const WIB_OFFSET_HOURS = 7;
const TELEMETRY_KEYS = [
  "temperature",
  "ph",
  "dissolvedOxygen",
  "salinity",
  "turbidity",
];

const PERIOD_TO_DAYS: Record<string, number> = {
  "7days": 7,
  "30days": 30,
  "90days": 90,
};

function getCurrentWIBHourStartUTC(): number {
  const now = new Date();
  const wibDate = new Date(now.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  wibDate.setMinutes(0, 0, 0);
  return wibDate.getTime() - WIB_OFFSET_HOURS * 60 * 60 * 1000;
}

function getWIBDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function calculateActiveDays(firstDataAt: Date): number {
  const firstDay = getWIBDayKey(firstDataAt);
  const todayDay = getWIBDayKey(new Date());

  const first = new Date(`${firstDay}T00:00:00.000Z`);
  const today = new Date(`${todayDay}T00:00:00.000Z`);

  const diffMs = today.getTime() - first.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deviceId = request.nextUrl.searchParams.get("deviceId");
    const period = request.nextUrl.searchParams.get("period") || "7days";
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
        thingsboardDeviceId: true,
        pondId: true,
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found or access denied" },
        { status: 404 }
      );
    }

    const periodStartDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [aggregateResult, firstSummary] = await Promise.all([
      prisma.hourlySummary.aggregate({
        where: {
          pondId: device.pondId,
          timestamp: { gte: periodStartDate },
        },
        _sum: { dataPoints: true },
      }),
      prisma.hourlySummary.findFirst({
        where: { pondId: device.pondId },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      }),
    ]);

    const baseTotalData = aggregateResult._sum.dataPoints ?? 0;

    let realtimeDataPoints = 0;
    if (device.thingsboardDeviceId) {
      try {
        const endTs = Date.now();
        const startTs = getCurrentWIBHourStartUTC();

        const currentHourHistory = await thingsboardService.getTelemetryHistory(
          device.thingsboardDeviceId,
          TELEMETRY_KEYS,
          startTs,
          endTs,
          5000
        );

        const uniqueTimestamps = new Set<number>();
        for (const values of Object.values(currentHourHistory)) {
          for (const value of values as { ts: number }[]) {
            uniqueTimestamps.add(value.ts);
          }
        }
        realtimeDataPoints = uniqueTimestamps.size;
      } catch (error) {
        console.warn("Failed to fetch realtime history points:", error);
      }
    }

    const firstDataAt = firstSummary?.timestamp || null;
    const activeDays = firstDataAt ? calculateActiveDays(firstDataAt) : 0;

    return NextResponse.json({
      success: true,
      data: {
        activeDays,
        firstDataAt: firstDataAt?.toISOString() || null,
        baseTotalData,
        realtimeDataPoints,
        totalData: baseTotalData + realtimeDataPoints,
      },
    });
  } catch (error) {
    console.error("History stats fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history stats" },
      { status: 500 }
    );
  }
}