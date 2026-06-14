import Pusher from "pusher";

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function triggerTelemetryUpdate(
  deviceId: string,
  data: Record<string, number>
) {
  const payload = {
    deviceId,
    ...data,
    timestamp: Date.now(),
  };

  await Promise.all([
    pusher.trigger(`device-${deviceId}`, "telemetry-update", payload),
    pusher.trigger("global-telemetry", "telemetry-update", payload),
  ]);
}

export async function triggerDeviceStatusUpdate(
  deviceId: string,
  isOnline: boolean
) {
  const payload = {
    deviceId,
    isOnline,
    timestamp: Date.now(),
  };

  await Promise.all([
    pusher.trigger(`device-${deviceId}`, "device-status", payload),
    pusher.trigger("global-telemetry", "device-status", payload),
  ]);
}

export async function triggerSummaryUpdate(
  type: "hourly" | "daily" | "weekly"
) {
  await pusher.trigger("global-telemetry", "summary-updated", {
    type,
    timestamp: Date.now(),
  });
}

export async function triggerAlertEvent(payload: {
  alertId?: string;
  deviceId: string;
  severity: "WARNING" | "CRITICAL";
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  message: string;
  action?: string;
  eventTime: number;
}) {
  await Promise.all([
    pusher.trigger(`device-${payload.deviceId}`, "alert-event", payload),
    pusher.trigger("global-telemetry", "alert-event", payload),
  ]);
}
