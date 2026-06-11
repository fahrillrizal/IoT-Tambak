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
  batteryLevel?: number;
  timestamp: number;
}

export interface SummaryUpdatePayload {
  type: "hourly" | "daily" | "weekly";
  timestamp: number;
}

export interface DeviceStatusPayload {
  deviceId: string;
  isOnline: boolean;
  timestamp: number;
}

export interface AlertEventPayload {
  alertId?: string;
  deviceId: string;
  severity: "WARNING" | "CRITICAL";
  status: "ACTIVE" | "CLEARED" | "ACKNOWLEDGED";
  message: string;
  action?: string;
  eventTime: number;
}

// ─── Per-device subscriptions ─────────────────────────────────────────────────

export function subscribeToDeviceTelemetry(
  deviceId: string,
  callback: (data: TelemetryPayload) => void,
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

export function subscribeToDeviceAlertEvents(
  deviceId: string,
  callback: (data: AlertEventPayload) => void,
) {
  const pusher = getPusherClient();
  const channelName = `device-${deviceId}`;
  const channel = pusher.subscribe(channelName);

  channel.bind("alert-event", (data: AlertEventPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("alert-event");
    pusher.unsubscribe(channelName);
  };
}

export function subscribeToSpecificDeviceStatus(
  deviceId: string,
  callback: (data: DeviceStatusPayload) => void,
) {
  const pusher = getPusherClient();
  const channelName = `device-${deviceId}`;
  const channel = pusher.subscribe(channelName);

  channel.bind("device-status", (data: DeviceStatusPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("device-status");
    pusher.unsubscribe(channelName);
  };
}

// ─── Global subscriptions (channel: "global-telemetry") ──────────────────────

export function subscribeToGlobalTelemetry(
  callback: (data: TelemetryPayload) => void,
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("telemetry-update", (data: TelemetryPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("telemetry-update");
  };
}

export function subscribeToSummaryUpdates(
  callback: (data: SummaryUpdatePayload) => void,
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

export function subscribeToDeviceStatus(
  callback: (data: DeviceStatusPayload) => void,
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("device-status", (data: DeviceStatusPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("device-status");
  };
}

/**
 * Subscribe ke semua alert event dari semua device sekaligus.
 * Channel: "global-telemetry", event: "alert-event"
 *
 * Dipakai oleh NotificationContext untuk update notif secara realtime
 * tanpa perlu fetch ulang ke DB setiap kali ada alert.
 */
export function subscribeToGlobalAlertEvents(
  callback: (data: AlertEventPayload) => void,
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("alert-event", (data: AlertEventPayload) => {
    callback(data);
  });

  return () => {
    channel.unbind("alert-event");
  };
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}
