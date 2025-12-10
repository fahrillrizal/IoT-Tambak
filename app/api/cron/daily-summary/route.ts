import { NextRequest, NextResponse } from "next/server";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await saveDailySummaryForYesterday();

    // Notify clients that daily summary is updated
    await pusher.trigger("global-telemetry", "summary-updated", {
      type: "daily",
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Daily summary saved successfully",
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
