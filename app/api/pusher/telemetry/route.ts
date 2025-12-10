import { NextRequest, NextResponse } from "next/server";
import { pusher } from "@/lib/pusher";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, data, secret } = body;

    if (secret !== process.env.PUSHER_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!deviceId || !data) {
      return NextResponse.json(
        { error: "deviceId and data are required" },
        { status: 400 }
      );
    }

    await pusher.trigger(`device-${deviceId}`, "telemetry-update", {
      deviceId,
      ...data,
      timestamp: Date.now(),
    });

    await pusher.trigger("global-telemetry", "telemetry-update", {
      deviceId,
      ...data,
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
