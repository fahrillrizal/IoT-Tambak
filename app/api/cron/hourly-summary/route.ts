import { NextRequest, NextResponse } from "next/server";
import {
  saveHourlySummaryForLastHour,
  cleanupOldHourlySummaries,
} from "@/lib/hourly-summary-scheduler";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

// Called by GitHub Actions every hour
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      console.log("❌ Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`🕐 Hourly cron triggered at ${new Date().toISOString()} via GitHub Actions`);

    await saveHourlySummaryForLastHour();

    await cleanupOldHourlySummaries();

    await pusher.trigger("global-telemetry", "summary-updated", {
      type: "hourly",
      timestamp: Date.now(),
    });

    // Also trigger daily summary at midnight UTC
    const now = new Date();
    if (now.getUTCHours() === 0) {
      console.log("🌙 Midnight UTC - also running daily summary");
      await saveDailySummaryForYesterday();

      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "daily",
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Hourly summary saved successfully",
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
