import { NextRequest, NextResponse } from "next/server";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      console.log("❌ Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(
      `📊 Daily cron triggered at ${new Date().toISOString()} via GitHub Actions`
    );

    const result = await saveDailySummaryForYesterday();

    if (result.saved > 0) {
      await pusher.trigger("global-telemetry", "summary-updated", {
        type: "daily",
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message:
        result.saved > 0
          ? "Daily summary saved successfully"
          : "No data to save (all zero or no data)",
      result,
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
