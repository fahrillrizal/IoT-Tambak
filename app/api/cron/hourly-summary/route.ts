import { NextRequest, NextResponse } from "next/server";
import {
  saveHourlySummaryForLastHour,
  cleanupOldHourlySummaries,
} from "@/lib/hourly-summary-scheduler";
import { saveDailySummaryForYesterday, saveTodayPartialSummary } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

// WIB offset for calculating current WIB hour
const WIB_OFFSET_HOURS = 7;

// Called by GitHub Actions every hour
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      console.log("❌ Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const wibHour = (now.getUTCHours() + WIB_OFFSET_HOURS) % 24;
    
    console.log(`🕐 Hourly cron triggered at ${now.toISOString()} (${wibHour}:00 WIB)`);

    await saveHourlySummaryForLastHour();

    await cleanupOldHourlySummaries();

    await pusher.trigger("global-telemetry", "summary-updated", {
      type: "hourly",
      timestamp: Date.now(),
    });

    // Update today's partial daily summary every 3 hours (WIB: 00, 03, 06, 09, 12, 15, 18, 21)
    if (wibHour % 3 === 0) {
      console.log(`📊 Every 3 hours (${wibHour}:00 WIB) - updating today's partial summary`);
      await saveTodayPartialSummary();

      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "daily",
        timestamp: Date.now(),
      });
    }

    // Also trigger yesterday's final daily summary at midnight WIB (17:00 UTC)
    if (now.getUTCHours() === 17) {
      console.log("🌙 Midnight WIB (17:00 UTC) - saving yesterday's final summary");
      await saveDailySummaryForYesterday();

      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "daily",
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Hourly summary saved successfully",
      wibHour: `${wibHour}:00 WIB`,
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
