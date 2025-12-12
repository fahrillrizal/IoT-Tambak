import { NextRequest, NextResponse } from "next/server";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

// Called by GitHub Actions daily at 00:05 UTC
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      console.log("❌ Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`📊 Daily cron triggered at ${new Date().toISOString()} via GitHub Actions`);

    await saveDailySummaryForYesterday();

    // Notify clients that daily summary is updated
    await pusher.trigger("global-telemetry", "summary-updated", {
      type: "daily",
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Daily summary saved successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
