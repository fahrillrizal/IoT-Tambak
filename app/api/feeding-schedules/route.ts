import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * GET /api/feeding-schedules?pondId=<id>
 * Returns all active feeding schedules for a pond, with today's execution status.
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

    // Verify pond ownership
    const pond = await prisma.pond.findFirst({
      where: { id: pondId, userId },
    });

    if (!pond) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    // Fetch schedules
    const schedules = await prisma.feedingSchedule.findMany({
      where: { pondId, isActive: true },
      orderBy: { time: "asc" },
    });

    // Check today's feeding history to determine schedule status
    const nowUTC = new Date();
    const nowWIB = new Date(nowUTC.getTime() + WIB_OFFSET_MS);
    const currentTimeWIB = `${String(nowWIB.getHours()).padStart(2, "0")}:${String(nowWIB.getMinutes()).padStart(2, "0")}`;

    // Today's start in UTC (WIB 00:00 = UTC 17:00 yesterday)
    const todayStartWIB = new Date(nowWIB);
    todayStartWIB.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStartWIB.getTime() - WIB_OFFSET_MS);

    const todayFeedings = await prisma.feedingHistory.findMany({
      where: {
        pondId,
        feedingType: "SCHEDULED",
        executedAt: { gte: todayStartUTC },
      },
      select: { executedAt: true, feedingStatus: true, notes: true },
    });

    // Get current day of week (0=Sun, 1=Mon, ..., 6=Sat)
    const dayOfWeek = nowWIB.getDay();
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayName = dayNames[dayOfWeek];

    const data = schedules.map((s) => {
      // Check if schedule is active today (daysOfWeek)
      const activeDays = s.daysOfWeek ? s.daysOfWeek.split(",").map((d) => d.trim().toLowerCase()) : [];
      const isActiveToday = activeDays.length === 0 || activeDays.includes(todayName) || activeDays.includes("everyday");

      // Determine status: completed, pending, or skipped
      let status: "completed" | "pending" | "skipped" = "pending";

      if (!isActiveToday) {
        status = "skipped";
      } else {
        // Check if there's a SCHEDULED feeding record close to this schedule time
        const scheduleExecuted = todayFeedings.some((f) => {
          const execWIB = new Date(f.executedAt.getTime() + WIB_OFFSET_MS);
          const execTime = `${String(execWIB.getHours()).padStart(2, "0")}:${String(execWIB.getMinutes()).padStart(2, "0")}`;
          // Match within 30 min window of schedule time
          const schedMinutes = parseInt(s.time.split(":")[0]) * 60 + parseInt(s.time.split(":")[1]);
          const execMinutes = parseInt(execTime.split(":")[0]) * 60 + parseInt(execTime.split(":")[1]);
          return Math.abs(schedMinutes - execMinutes) <= 30 && f.feedingStatus === "COMPLETED";
        });

        if (scheduleExecuted) {
          status = "completed";
        } else if (s.time < currentTimeWIB) {
          // Time has passed but no execution — mark as skipped
          status = "skipped";
        }
      }

      return {
        id: s.id,
        pondId: s.pondId,
        name: s.name,
        time: s.time,
        amount: Number(s.amount),
        daysOfWeek: s.daysOfWeek,
        isActive: s.isActive,
        status,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Feeding Schedules GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feeding-schedules
 * Create a new feeding schedule.
 * Body: { pondId, name?, time (HH:mm WIB), amount (gram), daysOfWeek? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json();
    const { pondId, name, time, amount, daysOfWeek } = body;

    if (!pondId || !time || !amount) {
      return NextResponse.json(
        { error: "pondId, time (HH:mm), and amount are required" },
        { status: 400 }
      );
    }

    // Validate time format HH:mm
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      return NextResponse.json(
        { error: "time must be in HH:mm format (WIB)" },
        { status: 400 }
      );
    }

    if (amount <= 0 || amount > 5000) {
      return NextResponse.json(
        { error: "amount must be between 1 and 5000 grams" },
        { status: 400 }
      );
    }

    // Verify pond ownership
    const pond = await prisma.pond.findFirst({
      where: { id: pondId, userId },
    });

    if (!pond) {
      return NextResponse.json({ error: "Pond not found" }, { status: 404 });
    }

    const schedule = await prisma.feedingSchedule.create({
      data: {
        pondId,
        name: name || `Schedule ${time}`,
        time,
        amount,
        daysOfWeek: daysOfWeek || "everyday",
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: schedule.id,
        pondId: schedule.pondId,
        name: schedule.name,
        time: schedule.time,
        amount: Number(schedule.amount),
        daysOfWeek: schedule.daysOfWeek,
        isActive: schedule.isActive,
      },
    });
  } catch (error) {
    console.error("[Feeding Schedules POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/feeding-schedules
 * Soft-delete a feeding schedule.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify schedule belongs to user's pond
    const schedule = await prisma.feedingSchedule.findFirst({
      where: { id },
      include: { pond: { select: { userId: true } } },
    });

    if (!schedule || schedule.pond.userId !== userId) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Soft delete (set isActive to false)
    await prisma.feedingSchedule.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Feeding Schedules DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
