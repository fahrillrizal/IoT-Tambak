import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { thingsboardService } from "@/lib/thingsboard";

const CRON_SECRET = process.env.CRON_SECRET;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * POST /api/cron/scheduled-feeding
 *
 * Called every minute (or every 5 min) by Vercel Cron or external scheduler.
 * Checks if any feeding schedule matches the current WIB time (within a 2-minute window)
 * and triggers RPC on the corresponding device.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowUTC = new Date();
    const nowWIB = new Date(nowUTC.getTime() + WIB_OFFSET_MS);
    const currentHour = nowWIB.getHours();
    const currentMinute = nowWIB.getMinutes();
    const currentTimeWIB = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

    // Day of week for filtering
    const dayOfWeek = nowWIB.getDay();
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayName = dayNames[dayOfWeek];

    console.log(`[Scheduled Feeding] Checking at WIB ${currentTimeWIB} (${todayName})`);

    // Convert current time to minutes since midnight for range comparison
    const currentMinutes = currentHour * 60 + currentMinute;

    // Find all active schedules, then filter in code by 10-minute window
    // This handles the case where cron runs every 10 minutes
    const allSchedules = await prisma.feedingSchedule.findMany({
      where: {
        isActive: true,
      },
      include: {
        pond: {
          select: {
            id: true,
            name: true,
            isActive: true,
            devices: {
              where: {
                isActive: true,
                thingsboardDeviceId: { not: null },
              },
              select: { id: true, thingsboardDeviceId: true, name: true },
              take: 1,
            },
          },
        },
      },
    });

    // Filter schedules within ±5 minutes of current time (covers 10-min cron interval)
    const schedules = allSchedules.filter((s) => {
      const [h, m] = s.time.split(":").map(Number);
      const scheduleMinutes = h * 60 + m;
      const diff = Math.abs(currentMinutes - scheduleMinutes);
      return diff <= 5; // within 5 minutes before or after
    });

    if (schedules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No schedules to execute at this time",
        time_wib: currentTimeWIB,
        executed: 0,
      });
    }

    let executed = 0;
    let failed = 0;
    const results: { pondId: number; scheduleId: number; status: string; reason?: string }[] = [];

    for (const schedule of schedules) {
      const pond = schedule.pond;

      // Check if active for today's day of week
      const activeDays = schedule.daysOfWeek
        .split(",")
        .map((d) => d.trim().toLowerCase());
      if (!activeDays.includes("everyday") && !activeDays.includes(todayName)) {
        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "skipped",
          reason: `Not active on ${todayName}`,
        });
        continue;
      }

      if (!pond.isActive) {
        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "skipped",
          reason: "Pond inactive",
        });
        continue;
      }

      const feederDevice = pond.devices[0];
      if (!feederDevice?.thingsboardDeviceId) {
        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "skipped",
          reason: "No feeder device",
        });
        continue;
      }

      // Check if already executed today (prevent duplicates if cron fires twice)
      const todayStartWIB = new Date(nowWIB);
      todayStartWIB.setHours(0, 0, 0, 0);
      const todayStartUTC = new Date(todayStartWIB.getTime() - WIB_OFFSET_MS);

      const alreadyExecuted = await prisma.feedingHistory.findFirst({
        where: {
          pondId: pond.id,
          feedingType: "SCHEDULED",
          feedingStatus: "COMPLETED",
          executedAt: { gte: todayStartUTC },
          notes: { contains: `schedule_id:${schedule.id}` },
        },
      });

      if (alreadyExecuted) {
        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "skipped",
          reason: "Already executed today",
        });
        continue;
      }

      // Send RPC to device
      const amountGram = Number(schedule.amount);
      try {
        await thingsboardService.sendRPCOneway(
          feederDevice.thingsboardDeviceId,
          "triggerFeeding",
          {
            amount_g: amountGram,
            source: "scheduled",
            schedule_id: schedule.id,
            ts: Date.now(),
          }
        );

        // Record successful feeding
        await prisma.feedingHistory.create({
          data: {
            deviceId: feederDevice.id,
            pondId: pond.id,
            feedingType: "SCHEDULED",
            feedingStatus: "COMPLETED",
            amount: amountGram,
            plannedAmount: amountGram,
            executedAt: nowUTC,
            notes: `Scheduled feeding at ${currentTimeWIB} WIB. schedule_id:${schedule.id}`,
          },
        });

        executed++;
        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "executed",
        });

        console.log(
          `[Scheduled Feeding] ✅ ${pond.name} — ${amountGram}g sent via ${feederDevice.name}`
        );
      } catch (rpcErr) {
        failed++;

        // Record failed attempt
        await prisma.feedingHistory.create({
          data: {
            deviceId: feederDevice.id,
            pondId: pond.id,
            feedingType: "SCHEDULED",
            feedingStatus: "FAILED",
            amount: amountGram,
            plannedAmount: amountGram,
            executedAt: nowUTC,
            notes: `Scheduled feeding failed at ${currentTimeWIB} WIB. schedule_id:${schedule.id}. Error: ${String(rpcErr)}`,
          },
        });

        results.push({
          pondId: pond.id,
          scheduleId: schedule.id,
          status: "failed",
          reason: String(rpcErr),
        });

        console.error(
          `[Scheduled Feeding] ❌ ${pond.name} — RPC failed:`,
          rpcErr
        );
      }
    }

    return NextResponse.json({
      success: true,
      time_wib: currentTimeWIB,
      day: todayName,
      total_schedules: schedules.length,
      executed,
      failed,
      results,
    });
  } catch (error) {
    console.error("[Scheduled Feeding Cron]", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
