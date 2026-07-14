import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * GET /api/history/feeding-chart?pondId=<id>
 *
 * Returns feeding frequency (sessions per day) for the last 7 days
 * formatted as Chart.js-compatible data.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const pondId = parseInt(searchParams.get("pondId") || "", 10);

    if (isNaN(pondId)) {
      return NextResponse.json(
        { error: "pondId is required" },
        { status: 400 }
      );
    }

    // Verify pond access: owner OR shared via UserDevice
    const pond = await prisma.pond.findFirst({
      where: {
        id: pondId,
        OR: [
          { userId },
          { devices: { some: { userDevices: { some: { userId } } } } },
        ],
      },
    });

    if (!pond) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    // Calculate the last 7 days in WIB
    const nowUTC = new Date();
    const nowWIB = new Date(nowUTC.getTime() + WIB_OFFSET_MS);

    // Build 7-day labels starting from Monday of current week (ISO week)
    const dayLabels: string[] = [];
    const dayRanges: { start: Date; end: Date }[] = [];

    // Find Monday of current week in WIB
    const dayOfWeek = nowWIB.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // days to subtract to get Monday
    const mondayWIB = new Date(nowWIB);
    mondayWIB.setDate(mondayWIB.getDate() + mondayOffset);
    mondayWIB.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const dayWIB = new Date(mondayWIB);
      dayWIB.setDate(dayWIB.getDate() + i);
      dayWIB.setHours(0, 0, 0, 0);

      const dayEndWIB = new Date(dayWIB);
      dayEndWIB.setHours(23, 59, 59, 999);

      // Convert to UTC for DB query
      const startUTC = new Date(dayWIB.getTime() - WIB_OFFSET_MS);
      const endUTC = new Date(dayEndWIB.getTime() - WIB_OFFSET_MS);

      dayRanges.push({ start: startUTC, end: endUTC });

      // Label: short day name (Mon, Tue, ...)
      const dayName = dayWIB.toLocaleDateString("en-US", { weekday: "short" });
      dayLabels.push(dayName);
    }

    // Fetch all feeding history for the 7-day window
    const feedings = await prisma.feedingHistory.findMany({
      where: {
        pondId,
        feedingStatus: "COMPLETED",
        executedAt: {
          gte: dayRanges[0].start,
          lte: dayRanges[6].end,
        },
      },
      select: { executedAt: true, feedingType: true, amount: true },
    });

    // Count sessions per day
    const sessionsPerDay: number[] = [];
    const amountPerDay: number[] = [];

    for (const range of dayRanges) {
      const dayFeedings = feedings.filter(
        (f) => f.executedAt >= range.start && f.executedAt <= range.end
      );
      sessionsPerDay.push(dayFeedings.length);
      amountPerDay.push(
        dayFeedings.reduce((sum, f) => sum + Number(f.amount), 0)
      );
    }

    // Chart.js format
    const data = {
      labels: dayLabels,
      datasets: [
        {
          label: "Feeding Sessions",
          data: sessionsPerDay,
          backgroundColor: "rgba(139, 92, 246, 0.8)",
          borderColor: "rgba(139, 92, 246, 0.8)",
          tension: 0.4,
          fill: true,
          borderRadius: 8,
        },
      ],
    };

    return NextResponse.json({
      success: true,
      data,
      summary: {
        totalSessions: sessionsPerDay.reduce((a, b) => a + b, 0),
        totalAmountG: Math.round(amountPerDay.reduce((a, b) => a + b, 0)),
        avgSessionsPerDay: Math.round(
          (sessionsPerDay.reduce((a, b) => a + b, 0) / 7) * 10
        ) / 10,
      },
    });
  } catch (error) {
    console.error("[Feeding Chart]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
