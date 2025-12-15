import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const CRON_SECRET = process.env.CRON_SECRET;
const WIB_OFFSET_HOURS = 7;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const nowWIB = new Date(now.getTime() + WIB_OFFSET_HOURS * 60 * 60 * 1000);
    const startWIB = new Date(nowWIB);
    startWIB.setMinutes(0, 0, 0);
    startWIB.setHours(startWIB.getHours() - 1);

    const startUTC = new Date(
      startWIB.getTime() - WIB_OFFSET_HOURS * 60 * 60 * 1000
    );
    const endUTC = new Date(startUTC.getTime() + 59 * 60 * 1000 + 59 * 1000);

    const device = await prisma.device.findFirst({
      where: {
        isActive: true,
        thingsboardDeviceId: { not: null },
        pond: { isActive: true },
      },
      select: { thingsboardDeviceId: true },
    });

    if (!device?.thingsboardDeviceId) {
      return NextResponse.json({
        hasData: false,
        reason: "No active devices",
      });
    }

    const history = await thingsboardService.getTelemetryHistory(
      device.thingsboardDeviceId,
      ["temperature"],
      startUTC.getTime(),
      endUTC.getTime(),
      1
    );

    const hasData = history?.temperature?.length > 0;

    let isValidData = false;
    if (hasData && history.temperature[0]) {
      const value = parseFloat(history.temperature[0].value);
      isValidData = value !== 0;
    }

    return NextResponse.json({
      hasData: hasData && isValidData,
      reason: !hasData
        ? "No telemetry data"
        : !isValidData
          ? "Data is zero"
          : "Data available",
      window: {
        start: startWIB.toISOString(),
        end: new Date(startWIB.getTime() + 59 * 60 * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error("Check data error:", error);

    return NextResponse.json({
      hasData: true,
      reason: "Error checking, running cron as fallback",
    });
  }
}
