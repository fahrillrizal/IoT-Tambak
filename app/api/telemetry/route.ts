import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { thingsboardService } from "@/lib/thingsboard";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const keys = [
      "temperature",
      "ph",
      "dissolvedOxygen",
      "salinity",
      "turbidity",
    ];

    const latest = await thingsboardService.getDeviceTelemetry(deviceId, keys);

    const getLatestValue = (arr?: any[]) => {
      if (Array.isArray(arr) && arr.length > 0) {
        const last = arr[0];
        return parseFloat(last.value);
      }
      return null;
    };

    const data = {
      temperature: getLatestValue(latest.temperature),
      ph: getLatestValue(latest.ph),
      dissolvedOxygen: getLatestValue(latest.dissolvedOxygen),
      salinity: getLatestValue(latest.salinity),
      turbidity: getLatestValue(latest.turbidity),
    };

    let status: "Normal" | "Warning" | "Critical" = "Normal";

    const t = data.temperature ?? undefined;
    const p = data.ph ?? undefined;
    const d = data.dissolvedOxygen ?? undefined;
    const s = data.salinity ?? undefined;
    const tb = data.turbidity ?? undefined;

    if (
      (t !== undefined && (t < 26 || t > 32)) ||
      (p !== undefined && (p < 7.5 || p > 8.5)) ||
      (d !== undefined && (d < 4 || d > 8))
    ) {
      status = "Critical";
    } else if (
      (s !== undefined && (s < 15 || s > 30)) ||
      (tb !== undefined && (tb < 10 || tb > 50))
    ) {
      status = "Warning";
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        status,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Telemetry fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch telemetry" },
      { status: 500 }
    );
  }
}