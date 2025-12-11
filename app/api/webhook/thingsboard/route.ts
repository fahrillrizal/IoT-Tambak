import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

interface ThingsboardWebhookPayload {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  ts?: number | string;
  values?: Record<string, number | string>;

  msg?: Record<string, number | string>;
  metadata?: {
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    ts?: string;
  };

  temperature?: number | string;
  ph?: number | string;
  dissolvedOxygen?: number | string;
  salinity?: number | string;
  turbidity?: number | string;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log("📡 Raw webhook body:", rawBody);

    let body: ThingsboardWebhookPayload;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("❌ Failed to parse webhook body:", e);
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    console.log(
      "📡 Parsed ThingsBoard webhook:",
      JSON.stringify(body, null, 2)
    );

    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get("authorization");
      const apiKey = request.headers.get("x-api-key");

      if (
        authHeader !== `Bearer ${WEBHOOK_SECRET}` &&
        apiKey !== WEBHOOK_SECRET
      ) {
        console.warn("⚠️ Unauthorized webhook request");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    let deviceId: string | undefined;

    if (body.deviceId) {
      deviceId = body.deviceId;
    } else if (body.metadata?.deviceId) {
      deviceId = body.metadata.deviceId;
    }

    if (!deviceId) {
      console.error("❌ Missing deviceId in webhook payload");
      console.log("Available fields:", Object.keys(body));
      return NextResponse.json(
        {
          error: "Missing deviceId",
          hint: "Pastikan Rule Chain ThingsBoard memiliki Script node untuk include deviceId",
        },
        { status: 400 }
      );
    }

    let telemetryData: Record<string, number> = {};
    const telemetryKeys = [
      "temperature",
      "ph",
      "dissolvedOxygen",
      "salinity",
      "turbidity",
    ];

    if (body.values && typeof body.values === "object") {
      for (const [key, value] of Object.entries(body.values)) {
        const numValue = parseNumber(value);
        if (numValue !== null) {
          telemetryData[key] = numValue;
        }
      }
    } else if (body.msg && typeof body.msg === "object") {
      for (const [key, value] of Object.entries(body.msg)) {
        const numValue = parseNumber(value);
        if (numValue !== null) {
          telemetryData[key] = numValue;
        }
      }
    } else {
      for (const key of telemetryKeys) {
        const value = body[key as keyof ThingsboardWebhookPayload];
        const numValue = parseNumber(value);
        if (numValue !== null) {
          telemetryData[key] = numValue;
        }
      }
    }

    if (Object.keys(telemetryData).length === 0) {
      console.log("⚠️ No valid telemetry data found in webhook");
      return NextResponse.json({
        success: true,
        message: "No telemetry data to process",
      });
    }

    let timestamp = Date.now();
    if (body.ts) {
      timestamp = typeof body.ts === "string" ? parseInt(body.ts) : body.ts;
    } else if (body.metadata?.ts) {
      timestamp = parseInt(body.metadata.ts);
    }

    const payload = {
      deviceId,
      ...telemetryData,
      timestamp,
    };

    console.log(`📤 Sending to Pusher for device ${deviceId}:`, payload);

    await pusher.trigger(`device-${deviceId}`, "telemetry-update", payload);

    await pusher.trigger("global-telemetry", "telemetry-update", payload);

    console.log(`✅ Telemetry forwarded to Pusher for device ${deviceId}`);

    return NextResponse.json({
      success: true,
      deviceId,
      telemetry: telemetryData,
      timestamp,
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

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && !isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "ThingsBoard webhook endpoint is active",
    timestamp: new Date().toISOString(),
    config: {
      secretConfigured: !!WEBHOOK_SECRET,
    },
  });
}
