import { NextRequest, NextResponse } from "next/server";
import {
  saveHourlySummaryForLastHour,
  cleanupOldHourlySummaries,
} from "@/lib/hourly-summary-scheduler";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await saveHourlySummaryForLastHour();

    await cleanupOldHourlySummaries();

    await pusher.trigger("global-telemetry", "summary-updated", {
      type: "hourly",
      timestamp: Date.now(),
    });

    const now = new Date();
    if (now.getUTCHours() === 0) {
      await saveDailySummaryForYesterday();

      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "daily",
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Hourly summary saved successfully",
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
