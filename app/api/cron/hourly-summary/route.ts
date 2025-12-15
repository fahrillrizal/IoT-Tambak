import { NextRequest, NextResponse } from "next/server";
import {
  saveHourlySummaryForLastHour,
  cleanupOldHourlySummaries,
} from "@/lib/hourly-summary-scheduler";
import {
  saveDailySummaryForYesterday,
  saveTodayPartialSummary,
} from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

const WIB_OFFSET_HOURS = 7;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      console.log("❌ Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const wibHour = (now.getUTCHours() + WIB_OFFSET_HOURS) % 24;

    console.log(
      `🕐 Hourly cron triggered at ${now.toISOString()} (${wibHour}:00 WIB)`
    );

    const hourlyResult = await saveHourlySummaryForLastHour();

    await cleanupOldHourlySummaries();

    if (hourlyResult.saved > 0) {
      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "hourly",
        timestamp: Date.now(),
      });
    }

    let todayResult = { saved: 0, skipped: 0 };
    if (wibHour % 3 === 0) {
      console.log(
        `📊 Every 3 hours (${wibHour}:00 WIB) - updating today's partial summary`
      );
      todayResult = await saveTodayPartialSummary();

      if (todayResult.saved > 0) {
        await pusher.trigger("global-telemetry", "summary-updated", {
          type: "daily",
          timestamp: Date.now(),
        });
      }
    }

    let yesterdayResult = { saved: 0, skipped: 0 };
    if (now.getUTCHours() === 17) {
      console.log(
        "🌙 Midnight WIB (17:00 UTC) - saving yesterday's final summary"
      );
      yesterdayResult = await saveDailySummaryForYesterday();

      if (yesterdayResult.saved > 0) {
        await pusher.trigger("global-telemetry", "summary-updated", {
          type: "daily",
          timestamp: Date.now(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message:
        hourlyResult.saved > 0
          ? "Data saved successfully"
          : "No data to save (all zero or no data)",
      wibHour: `${wibHour}:00 WIB`,
      hourly: hourlyResult,
      today: todayResult,
      yesterday: yesterdayResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Hourly cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
