import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

interface ThingsboardWebhookPayload {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  ts?: number;
  values?: Record<string, number | string>;

  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      console.warn("Unauthorized webhook request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ThingsboardWebhookPayload = await request.json();
    console.log(
      "📡 Received ThingsBoard webhook:",
      JSON.stringify(body, null, 2)
    );

    const deviceId = body.deviceId;
    if (!deviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    let telemetryData: Record<string, number> = {};

    if (body.values) {
      for (const [key, value] of Object.entries(body.values)) {
        if (typeof value === "number") {
          telemetryData[key] = value;
        } else if (typeof value === "string") {
          const parsed = parseFloat(value);
          if (!isNaN(parsed)) {
            telemetryData[key] = parsed;
          }
        }
      }
    } else {
      const keys = [
        "temperature",
        "ph",
        "dissolvedOxygen",
        "salinity",
        "turbidity",
      ];
      for (const key of keys) {
        const value = body[key as keyof ThingsboardWebhookPayload];
        if (typeof value === "number") {
          telemetryData[key] = value;
        }
      }
    }

    if (Object.keys(telemetryData).length === 0) {
      console.log("No valid telemetry data found in webhook");
      return NextResponse.json({ success: true, message: "No telemetry data" });
    }

    const payload = {
      deviceId,
      ...telemetryData,
      timestamp: body.ts || Date.now(),
    };

    await pusher.trigger(`device-${deviceId}`, "telemetry-update", payload);

    await pusher.trigger("global-telemetry", "telemetry-update", payload);

    console.log(
      `✅ Forwarded telemetry to Pusher for device ${deviceId}:`,
      telemetryData
    );

    return NextResponse.json({
      success: true,
      deviceId,
      telemetry: telemetryData,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "ThingsBoard webhook endpoint is active",
  });
}
