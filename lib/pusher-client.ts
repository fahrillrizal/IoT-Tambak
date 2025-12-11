import PusherJS from "pusher-js";

let pusherInstance: PusherJS | null = null;
let connectionState: string = "disconnected";

export function getPusherClient(): PusherJS {
  if (!pusherInstance && typeof window !== "undefined") {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.error("❌ Missing Pusher configuration");
      throw new Error("Pusher configuration missing");
    }

    if (process.env.NODE_ENV === "development") {
      PusherJS.logToConsole = true;
    }

    pusherInstance = new PusherJS(key, {
      cluster: cluster,
      forceTLS: true,
      enabledTransports: ["ws", "wss"],
    });

    pusherInstance.connection.bind("connected", () => {
      connectionState = "connected";
      console.log(
        "✓ Pusher connected, socket ID:",
        pusherInstance?.connection.socket_id
      );
    });

    pusherInstance.connection.bind("disconnected", () => {
      connectionState = "disconnected";
      console.log("⚠️ Pusher disconnected");
    });

    pusherInstance.connection.bind("error", (err: any) => {
      connectionState = "error";
      console.error("❌ Pusher connection error:", err);
    });

    pusherInstance.connection.bind(
      "state_change",
      (states: { current: string; previous: string }) => {
        connectionState = states.current;
        console.log(`📡 Pusher state: ${states.previous} → ${states.current}`);
      }
    );
  }
  return pusherInstance!;
}

export function getPusherConnectionState(): string {
  return connectionState;
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

export interface SummaryUpdatePayload {
  type: "hourly" | "daily" | "weekly";
  timestamp: number;
}

export function subscribeToDeviceTelemetry(
  deviceId: string,
  callback: (data: TelemetryPayload) => void
) {
  const pusher = getPusherClient();
  const channelName = `device-${deviceId}`;

  console.log(`📡 Subscribing to Pusher channel: ${channelName}`);

  const channel = pusher.subscribe(channelName);

  channel.bind("pusher:subscription_succeeded", () => {
    console.log(`✓ Subscribed to ${channelName}`);
  });

  channel.bind("pusher:subscription_error", (error: any) => {
    console.error(`❌ Subscription error for ${channelName}:`, error);
  });

  channel.bind("telemetry-update", (data: TelemetryPayload) => {
    console.log("📡 Pusher telemetry received:", data);
    callback(data);
  });

  return () => {
    console.log(`📡 Unsubscribing from ${channelName}`);
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
    console.log("📡 Pusher global telemetry:", data);
    callback(data);
  });

  return () => {
    channel.unbind("telemetry-update");
    pusher.unsubscribe("global-telemetry");
  };
}

export function subscribeToSummaryUpdates(
  callback: (data: SummaryUpdatePayload) => void
) {
  const pusher = getPusherClient();
  const channel = pusher.subscribe("global-telemetry");

  channel.bind("summary-updated", (data: SummaryUpdatePayload) => {
    console.log("📊 Summary updated:", data);
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
    connectionState = "disconnected";
  }
}
