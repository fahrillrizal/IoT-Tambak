import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;
let connectionState: string = "disconnected";

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

export function getSocketClient(): Socket {
  if (!socketInstance && typeof window !== "undefined") {
    socketInstance = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
      autoConnect: true,
    });

    socketInstance.on("connect", () => {
      connectionState = "connected";
      console.log("✓ Socket.IO connected:", socketInstance?.id);
    });

    socketInstance.on("disconnect", (reason) => {
      connectionState = "disconnected";
      console.log("⚠️ Socket.IO disconnected:", reason);

      if (reason === "io server disconnect") {
        socketInstance?.connect();
      }
    });

    socketInstance.on("connect_error", (error) => {
      connectionState = "error";
      console.error("❌ Socket.IO connection error:", error.message);
    });

    socketInstance.on("reconnect", (attemptNumber) => {
      console.log(`✓ Socket.IO reconnected after ${attemptNumber} attempts`);
    });

    socketInstance.on("reconnect_attempt", (attemptNumber) => {
      console.log(`🔄 Socket.IO reconnection attempt ${attemptNumber}`);
    });
  }
  return socketInstance!;
}

export function getSocketConnectionState(): string {
  return connectionState;
}

export function subscribeToDeviceWebSocket(
  deviceId: string,
  callback: (data: TelemetryPayload) => void
) {
  const socket = getSocketClient();

  socket.emit("subscribe:device", deviceId);
  console.log(`📡 Subscribed to WebSocket device: ${deviceId}`);

  const handleTelemetry = (payload: {
    deviceId: string;
    data: any;
    timestamp: number;
  }) => {
    if (payload.deviceId === deviceId) {
      console.log("📡 Socket.IO telemetry received:", payload);
      callback({
        deviceId: payload.deviceId,
        ...payload.data,
        timestamp: payload.timestamp,
      });
    }
  };

  socket.on("telemetry", handleTelemetry);
  socket.on("telemetry:update", handleTelemetry);

  return () => {
    socket.emit("unsubscribe:device", deviceId);
    socket.off("telemetry", handleTelemetry);
    socket.off("telemetry:update", handleTelemetry);
    console.log(`📡 Unsubscribed from WebSocket device: ${deviceId}`);
  };
}

export function subscribeToGlobalWebSocket(
  callback: (data: TelemetryPayload) => void
) {
  const socket = getSocketClient();

  const handleTelemetry = (payload: {
    deviceId: string;
    data: any;
    timestamp: number;
  }) => {
    callback({
      deviceId: payload.deviceId,
      ...payload.data,
      timestamp: payload.timestamp,
    });
  };

  socket.on("telemetry:update", handleTelemetry);

  return () => {
    socket.off("telemetry:update", handleTelemetry);
  };
}

export function subscribeToSummaryUpdates(
  callback: (data: SummaryUpdatePayload) => void
) {
  const socket = getSocketClient();

  socket.on("summary:updated", (data: SummaryUpdatePayload) => {
    console.log("📊 Summary updated via Socket.IO:", data);
    callback(data);
  });

  return () => {
    socket.off("summary:updated");
  };
}

export function subscribeToDeviceStatus(
  callback: (data: DeviceStatusPayload) => void
) {
  const socket = getSocketClient();

  socket.on("device:status", (data: DeviceStatusPayload) => {
    console.log("📡 Device status updated via Socket.IO:", data);
    callback(data);
  });

  return () => {
    socket.off("device:status");
  };
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    connectionState = "disconnected";
  }
}

export function reconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance.connect();
  }
}
