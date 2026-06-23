import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/history/feeding?pondId=<id>&limit=20
 *
 * Returns feeding history for a given pond, including stats.
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
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    if (isNaN(pondId)) {
      return NextResponse.json(
        { error: "pondId is required" },
        { status: 400 }
      );
    }

    // Verify pond ownership
    const pond = await prisma.pond.findFirst({
      where: { id: pondId, userId },
    });

    if (!pond) {
      return NextResponse.json(
        { error: "Pond not found" },
        { status: 404 }
      );
    }

    // Fetch recent feeding history
    const feedingHistory = await prisma.feedingHistory.findMany({
      where: { pondId },
      orderBy: { executedAt: "desc" },
      take: limit,
      select: {
        id: true,
        feedingType: true,
        feedingStatus: true,
        amount: true,
        plannedAmount: true,
        executedAt: true,
        notes: true,
      },
    });

    // Calculate stats for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayFeedings = await prisma.feedingHistory.findMany({
      where: {
        pondId,
        executedAt: { gte: todayStart },
        feedingStatus: "COMPLETED",
      },
      select: { amount: true, executedAt: true },
    });

    // Calculate 7-day stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekFeedings = await prisma.feedingHistory.findMany({
      where: {
        pondId,
        executedAt: { gte: weekStart },
      },
      select: { feedingStatus: true, amount: true },
    });

    const totalSessions = weekFeedings.length;
    const completedSessions = weekFeedings.filter(
      (f) => f.feedingStatus === "COMPLETED"
    ).length;
    const totalFeedGram = weekFeedings
      .filter((f) => f.feedingStatus === "COMPLETED")
      .reduce((sum, f) => sum + Number(f.amount), 0);
    const successRate =
      totalSessions > 0
        ? Math.round((completedSessions / totalSessions) * 100)
        : 100;
    const avgPerDayGram = totalFeedGram / 7;

    // Today's total
    const todayTotalGram = todayFeedings.reduce(
      (sum, f) => sum + Number(f.amount),
      0
    );
    const lastFeedingToday = todayFeedings[0]?.executedAt ?? null;

    const data = feedingHistory.map((f) => ({
      id: f.id.toString(),
      feedingType: f.feedingType,
      feedingStatus: f.feedingStatus,
      amount: Number(f.amount),
      plannedAmount: f.plannedAmount ? Number(f.plannedAmount) : null,
      executedAt: f.executedAt.toISOString(),
      notes: f.notes,
    }));

    return NextResponse.json({
      success: true,
      data,
      stats: {
        totalSessions,
        totalFeedKg: Math.round((totalFeedGram / 1000) * 10) / 10,
        avgPerDay: Math.round(avgPerDayGram) ,
        successRate,
        todayTotalGram: Math.round(todayTotalGram),
        todaySessions: todayFeedings.length,
        lastFeedingToday: lastFeedingToday?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[Feeding History]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
