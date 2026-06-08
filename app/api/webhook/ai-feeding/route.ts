import { NextRequest, NextResponse } from "next/server";
import { runAIAutoFeedingFromWebhook } from "@/lib/ai-feeding-scheduler";

const WEBHOOK_SECRET = process.env.TB_WEBHOOK_SECRET || "";

function normalizeSecret(value: string): string {
  return value.trim().replace(/ /g, "+");
}

type SensorPayload = {
  temperature?: number | null;
  ph?: number | null;
  dissolvedOxygen?: number | null;
  salinity?: number | null;
  turbidity?: number | null;
};

function normalizeSensor(payload: SensorPayload) {
  return {
    temperature:
      typeof payload.temperature === "number" && Number.isFinite(payload.temperature)
        ? payload.temperature
        : null,
    ph: typeof payload.ph === "number" && Number.isFinite(payload.ph) ? payload.ph : null,
    dissolvedOxygen:
      typeof payload.dissolvedOxygen === "number" && Number.isFinite(payload.dissolvedOxygen)
        ? payload.dissolvedOxygen
        : null,
    salinity:
      typeof payload.salinity === "number" && Number.isFinite(payload.salinity)
        ? payload.salinity
        : null,
    turbidity:
      typeof payload.turbidity === "number" && Number.isFinite(payload.turbidity)
        ? payload.turbidity
        : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    if (WEBHOOK_SECRET) {
      const querySecret = searchParams.get("secret");
      if (!querySecret || normalizeSecret(querySecret) !== normalizeSecret(WEBHOOK_SECRET)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const payload =
      body?.msg && typeof body.msg === "object"
        ? body.msg
        : body;
    const metadata =
      body?.metadata && typeof body.metadata === "object"
        ? body.metadata
        : {};

    const queryDeviceId = searchParams.get("deviceId");
    const bodyDeviceId = payload?.deviceId || metadata?.deviceId || body?.deviceId;
    const tbDeviceId = String(queryDeviceId || bodyDeviceId || "").trim();

    if (!tbDeviceId) {
      return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
    }

    const rawParams =
      payload?.parameters ||
      payload?.values ||
      metadata?.parameters ||
      body?.parameters ||
      {};

    const sensor = normalizeSensor({
      temperature: rawParams.temperature ?? payload.temperature,
      ph: rawParams.ph ?? payload.ph,
      dissolvedOxygen: rawParams.dissolvedOxygen ?? payload.dissolvedOxygen,
      salinity: rawParams.salinity ?? payload.salinity,
      turbidity: rawParams.turbidity ?? payload.turbidity,
    });

    const result = await runAIAutoFeedingFromWebhook({
      tbDeviceId,
      sensor,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("AI feeding webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process AI feeding webhook" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
