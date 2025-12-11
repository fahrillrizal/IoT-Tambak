import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

export async function POST(request: NextRequest) {
  try {
    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get("authorization");
      const querySecret = request.nextUrl.searchParams.get("secret");

      const isAuthorized =
        authHeader === `Bearer ${WEBHOOK_SECRET}` ||
        querySecret === WEBHOOK_SECRET;

      if (!isAuthorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();

    const deviceId =
      body.deviceId || body.metadata?.deviceId || body.metadata?.originatorId;

    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const telemetryKeys = [
      "temperature",
      "ph",
      "dissolvedOxygen",
      "salinity",
      "turbidity",
    ];
    const dataSource = body.values || body.msg || body.data || body;
    const telemetryData: Record<string, number> = {};

    for (const key of telemetryKeys) {
      const value = dataSource[key];
      if (value !== undefined && value !== null) {
        const num =
          typeof value === "number" ? value : parseFloat(String(value));
        if (!isNaN(num)) {
          telemetryData[key] = num;
        }
      }
    }

    if (Object.keys(telemetryData).length === 0) {
      return NextResponse.json({ success: true, message: "No telemetry data" });
    }

    const payload = {
      deviceId,
      ...telemetryData,
      timestamp: body.ts || Date.now(),
    };

    await Promise.all([
      pusher.trigger(`device-${deviceId}`, "telemetry-update", payload),
      pusher.trigger("global-telemetry", "telemetry-update", payload),
    ]);

    return NextResponse.json({
      success: true,
      deviceId,
      telemetry: telemetryData,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "ThingsBoard webhook endpoint",
  });
}
