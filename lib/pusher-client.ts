import PusherJS from "pusher-js";

let pusherInstance: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (!pusherInstance && typeof window !== "undefined") {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      throw new Error("Pusher not configured");
    }

    pusherInstance = new PusherJS(key, {
      cluster,
      forceTLS: true,
    });
  }
  return pusherInstance!;
}

export interface TelemetryPayload {
  deviceId: string;
  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
  timestamp: number;
}

export function subscribeToDeviceTelemetry(
  deviceId: string,
  callback: (data: TelemetryPayload) => void
) {
  const pusher = getPusherClient();
  const channelName = `device-${deviceId}`;
  const channel = pusher.subscribe(channelName);

  channel.bind("telemetry-update", (data: TelemetryPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("telemetry-update");
    pusher.unsubscribe(channelName);
  };
}

export function subscribeToGlobalTelemetry(
  callback: (data: TelemetryPayload) => void
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("telemetry-update", (data: TelemetryPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("telemetry-update");
    pusher.unsubscribe("global-telemetry");
  };
}

export interface SummaryUpdatePayload {
  type: "hourly" | "daily" | "weekly";
  timestamp: number;
}

export function subscribeToSummaryUpdates(
  callback: (data: SummaryUpdatePayload) => void
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("summary-updated", (data: SummaryUpdatePayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("summary-updated");
  };
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}
