import Pusher from "pusher";

const requiredEnvVars = [
  "PUSHER_APP_ID",
  "NEXT_PUBLIC_PUSHER_KEY",
  "PUSHER_SECRET",
  "NEXT_PUBLIC_PUSHER_CLUSTER",
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`⚠️ Missing Pusher env vars: ${missingVars.join(", ")}`);
}

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1",
  useTLS: true,
});

const lastTriggerTime = new Map<string, number>();
const MIN_TRIGGER_INTERVAL = 1000;

export async function triggerTelemetryUpdate(
  deviceId: string,
  data: Record<string, number>
) {
  const now = Date.now();
  const lastTime = lastTriggerTime.get(deviceId) || 0;

  if (now - lastTime < MIN_TRIGGER_INTERVAL) {
    console.log(`⏭️ Skipping Pusher trigger for ${deviceId} (rate limited)`);
    return;
  }

  lastTriggerTime.set(deviceId, now);

  try {
    const payload = {
      deviceId,
      ...data,
      timestamp: now,
    };

    await Promise.all([
      pusher.trigger(`device-${deviceId}`, "telemetry-update", payload),
      pusher.trigger("global-telemetry", "telemetry-update", payload),
    ]);

    console.log(`✓ Pusher: Sent telemetry for device ${deviceId}`);
  } catch (error) {
    console.error("❌ Pusher trigger error:", error);
    throw error;
  }
}

export async function triggerSummaryUpdate(
  type: "hourly" | "daily" | "weekly"
) {
  try {
    await pusher.trigger("global-telemetry", "summary-updated", {
      type,
      timestamp: Date.now(),
    });
    console.log(`✓ Pusher: Sent ${type} summary update notification`);
  } catch (error) {
    console.error("❌ Pusher summary trigger error:", error);
    throw error;
  }
}

export async function testPusherConnection(): Promise<boolean> {
  try {
    await pusher.trigger("test-channel", "test-event", {
      message: "Connection test",
      timestamp: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("❌ Pusher connection test failed:", error);
    return false;
  }
}
