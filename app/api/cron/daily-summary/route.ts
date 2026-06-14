import { NextRequest, NextResponse } from "next/server";
import { saveDailySummaryForYesterday } from "@/lib/daily-summary-scheduler";
import { pusher } from "@/lib/pusher";
import { prisma } from "@/lib/db";

const CRON_SECRET = process.env.CRON_SECRET;

async function updateShrimpAgeDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ponds = await prisma.pond.findMany({
    where: {
      isActive: true,
      stockingDate: { not: null },
    },
    select: { id: true, stockingDate: true },
  });

  let updated = 0;
  for (const pond of ponds) {
    if (!pond.stockingDate) continue;
    const diffDays = Math.floor(
      (today.getTime() - new Date(pond.stockingDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    await prisma.pond.update({
      where: { id: pond.id },
      data: { shrimpAgeDays: Math.max(0, diffDays) },
    });
    updated++;
  }

  return updated;
}

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

    const pondsUpdated = await updateShrimpAgeDays();
    console.log(`🦐 Updated shrimp age for ${pondsUpdated} ponds`);

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
      pondsUpdated,
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
