import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import WebSocket from "ws";
import dotenv from "dotenv";
import { startCronJobs } from "./lib/cron-jobs";
import { triggerTelemetryUpdate } from "./lib/pusher";
import { prisma } from "./lib/db";
import axios from "axios";

dotenv.config();

const requiredEnv = [
  "TB_URL",
  "TB_USERNAME",
  "TB_PASSWORD",
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const dev = process.env.NODE_ENV !== "production";

const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const TB_URL = process.env.TB_URL!;
const TB_WS_URL = TB_URL.replace("http://", "ws://").replace(
  "https://",
  "wss://"
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const deviceSubscriptions = new Map<string, WebSocket>();
let tbToken: string | null = null;
let tokenExpiry = 0;

const PING_INTERVAL = 30000;

const RECONNECT_DELAY = 5000;

const MAX_RECONNECT_ATTEMPTS = 10;

const reconnectAttempts = new Map<string, number>();

async function getTBToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tbToken && tokenExpiry > Date.now() + 60000) {
    return tbToken;
  }

  console.log("🔑 Refreshing ThingsBoard token...");

  try {
    const response = await axios.post(`${TB_URL}/api/auth/login`, {
      username: process.env.TB_USERNAME,
      password: process.env.TB_PASSWORD,
    });

    tbToken = response.data.token;

    tokenExpiry = Date.now() + 50 * 60 * 1000;
    console.log("✓ ThingsBoard token refreshed successfully");
    return tbToken!;
  } catch (error) {
    console.error("❌ Failed to refresh ThingsBoard token:", error);
    throw error;
  }
}

async function subscribeToDeviceTelemetry(deviceId: string, io: Server) {
  const existingWs = deviceSubscriptions.get(deviceId);
  if (existingWs) {
    console.log(`Closing existing WebSocket for device ${deviceId}`);
    existingWs.removeAllListeners();
    existingWs.close();
    deviceSubscriptions.delete(deviceId);
  }

  const attempts = reconnectAttempts.get(deviceId) || 0;
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`❌ Max reconnect attempts reached for device ${deviceId}`);

    setTimeout(
      () => {
        reconnectAttempts.set(deviceId, 0);
        subscribeToDeviceTelemetry(deviceId, io);
      },
      5 * 60 * 1000
    );
    return;
  }

  try {
    const token = await getTBToken(attempts > 0);
    const wsUrl = `${TB_WS_URL}/api/ws/plugins/telemetry?token=${token}`;

    const ws = new WebSocket(wsUrl);
    let pingInterval: NodeJS.Timeout | null = null;
    let isAlive = true;

    ws.on("open", () => {
      console.log(`✓ ThingsBoard WS connected for device: ${deviceId}`);
      reconnectAttempts.set(deviceId, 0);

      const subscribeCmd = {
        tsSubCmds: [
          {
            entityType: "DEVICE",
            entityId: deviceId,
            scope: "LATEST_TELEMETRY",
            cmdId: 1,
          },
        ],
        historyCmds: [],
        attrSubCmds: [],
      };

      ws.send(JSON.stringify(subscribeCmd));
      console.log(`✓ Subscribed to telemetry for device: ${deviceId}`);

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          if (!isAlive) {
            console.log(
              `⚠️ WebSocket not responding for device ${deviceId}, reconnecting...`
            );
            ws.terminate();
            return;
          }
          isAlive = false;
          ws.ping();
        }
      }, PING_INTERVAL);
    });

    ws.on("pong", () => {
      isAlive = true;
    });

    ws.on("message", (rawData) => {
      isAlive = true;

      try {
        const message = JSON.parse(rawData.toString());

        if (message.subscriptionId && message.data) {
          const telemetryData: Record<string, number> = {};

          for (const [key, values] of Object.entries(message.data)) {
            if (Array.isArray(values) && values.length > 0) {
              const latest = values[values.length - 1] as [number, string];
              telemetryData[key] = parseFloat(latest[1]);
            }
          }

          if (Object.keys(telemetryData).length > 0) {
            console.log(`📡 Telemetry from device ${deviceId}:`, telemetryData);

            io.to(`device:${deviceId}`).emit("telemetry", {
              deviceId,
              data: telemetryData,
              timestamp: Date.now(),
            });

            io.emit("telemetry:update", {
              deviceId,
              data: telemetryData,
              timestamp: Date.now(),
            });

            if (!dev) {
              triggerTelemetryUpdate(deviceId, telemetryData).catch((err) => {
                console.error("Failed to forward telemetry to Pusher:", err);
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to parse ThingsBoard WS message:", err);
      }
    });

    ws.on("error", (err) => {
      console.error(
        `❌ ThingsBoard WS error for device ${deviceId}:`,
        err.message
      );
    });

    ws.on("close", (code, reason) => {
      console.log(
        `WebSocket closed for device ${deviceId}: ${code} - ${reason?.toString() || "No reason"}`
      );

      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      deviceSubscriptions.delete(deviceId);

      reconnectAttempts.set(
        deviceId,
        (reconnectAttempts.get(deviceId) || 0) + 1
      );

      const delay = Math.min(
        RECONNECT_DELAY * Math.pow(2, reconnectAttempts.get(deviceId) || 0),
        60000
      );
      console.log(`🔄 Reconnecting to device ${deviceId} in ${delay}ms...`);

      setTimeout(() => {
        subscribeToDeviceTelemetry(deviceId, io);
      }, delay);
    });

    deviceSubscriptions.set(deviceId, ws);
  } catch (error) {
    console.error(`❌ Failed to subscribe to device ${deviceId}:`, error);

    reconnectAttempts.set(deviceId, (reconnectAttempts.get(deviceId) || 0) + 1);
    const delay = Math.min(
      RECONNECT_DELAY * Math.pow(2, reconnectAttempts.get(deviceId) || 0),
      60000
    );

    setTimeout(() => {
      subscribeToDeviceTelemetry(deviceId, io);
    }, delay);
  }
}

async function setupTokenRefresh(io: Server) {
  setInterval(
    async () => {
      console.log("🔄 Scheduled token refresh and WebSocket reconnection...");

      try {
        await getTBToken(true);

        const devices = Array.from(deviceSubscriptions.keys());
        for (const deviceId of devices) {
          await subscribeToDeviceTelemetry(deviceId, io);

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log("✓ All WebSocket connections refreshed");
      } catch (error) {
        console.error("❌ Token refresh failed:", error);
      }
    },
    45 * 60 * 1000
  );
}

async function initializeTelemetrySubscriptions(io: Server) {
  try {
    const devices = await prisma.device.findMany({
      where: {
        isActive: true,
        thingsboardDeviceId: { not: null },
      },
      select: {
        thingsboardDeviceId: true,
        name: true,
      },
    });

    console.log(
      `Found ${devices.length} active devices for telemetry subscription`
    );

    for (const device of devices) {
      if (device.thingsboardDeviceId) {
        await subscribeToDeviceTelemetry(device.thingsboardDeviceId, io);

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setupTokenRefresh(io);
  } catch (error) {
    console.error("Failed to initialize telemetry subscriptions:", error);
  }
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    console.log("✓ WebSocket client connected:", socket.id);

    socket.on("subscribe:device", (deviceId: string) => {
      socket.join(`device:${deviceId}`);
      console.log(`Client ${socket.id} subscribed to device: ${deviceId}`);
    });

    socket.on("unsubscribe:device", (deviceId: string) => {
      socket.leave(`device:${deviceId}`);
      console.log(`Client ${socket.id} unsubscribed from device: ${deviceId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(
        "WebSocket client disconnected:",
        socket.id,
        "Reason:",
        reason
      );
    });
  });

  server.listen(port, async (err?: unknown) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);

    await initializeTelemetrySubscriptions(io);

    try {
      startCronJobs();
    } catch (cronError) {
      console.error("Failed to start cron jobs:", cronError);
    }
  });
});
