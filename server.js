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
      console.log("✓ Connected to MQTT broker");
    });

    mqttClient.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.deviceId) {
          io.to(`pond:${data.deviceId}`).emit("pond:telemetry", data);
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
