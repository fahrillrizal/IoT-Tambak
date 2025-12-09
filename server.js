const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const mqtt = require("mqtt");
require("dotenv").config();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(server, {
    cors: {
      origin:
        process.env.NODE_ENV === "production" ? process.env.NEXTAUTH_URL : "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("✓ Client connected:", socket.id);

    socket.on("subscribe:pond", (pondId) => {
      socket.join(`pond:${pondId}`);
      console.log(`Client ${socket.id} subscribed to pond:${pondId}`);
    });

    socket.on("unsubscribe:pond", (pondId) => {
      socket.leave(`pond:${pondId}`);
      console.log(`Client ${socket.id} unsubscribed from pond:${pondId}`);
    });

    socket.on("disconnect", () => {
      console.log("✗ Client disconnected:", socket.id);
    });
  });

  global.io = io;

  if (process.env.MQTT_BROKER) {
    const mqttClient = mqtt.connect(
      `mqtt://${process.env.MQTT_BROKER}:${process.env.MQTT_PORT}`
    );

    mqttClient.on("connect", () => {
      console.log("✓ Connected to MQTT broker (ThingsBoard)");

      // Subscribe ke topic telemetry ThingsBoard
      // Format: v1/devices/me/telemetry (untuk device sendiri)
      mqttClient.subscribe("v1/devices/+/telemetry", (err) => {
        if (!err) {
          console.log("✓ Subscribed to device telemetry topics");
        } else {
          console.error("✗ Failed to subscribe:", err);
        }
      });
    });

    mqttClient.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log("📥 MQTT Message:", topic, data);

        // Emit ke Socket.io (untuk local dev)
        if (data.deviceId) {
          io.to(`pond:${data.deviceId}`).emit("telemetry:update", data);
        }
        io.emit("telemetry:update", data);

        // Trigger Pusher (untuk production)
        // Kirim ke webhook API untuk trigger Pusher
        if (process.env.PUSHER_WEBHOOK_SECRET) {
          const deviceIdFromTopic = topic.split("/")[2]; // Extract dari v1/devices/{id}/telemetry
          
          fetch(`${process.env.NEXTAUTH_URL}/api/pusher/telemetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId: deviceIdFromTopic,
              data,
              secret: process.env.PUSHER_WEBHOOK_SECRET,
            }),
          }).catch((err) => console.error("Pusher webhook error:", err));
        }
      } catch (err) {
        console.error("MQTT message parse error:", err);
      }
    });

    global.mqttClient = mqttClient;
  }

  server.listen(port, (err) => {
    if (err) throw err;
    console.log("");
    console.log("🚀 Server ready!");
    console.log(`   > Local:    http://${hostname}:${port}`);
    console.log(`   > Network:  http://0.0.0.0:${port}`);
    console.log("");
    console.log("⚡ WebSocket server active");
    console.log("📊 ThingsBoard integration ready");
    console.log("");
  });
});
