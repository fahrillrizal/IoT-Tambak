import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { startCronJobs } from './lib/cron-jobs';
import { triggerTelemetryUpdate } from './lib/pusher';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // MQTT setup
  const mqttBroker = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const mqttClient = mqtt.connect(mqttBroker);

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe('v1/devices/+/telemetry', (err) => {
      if (err) {
        console.error('Failed to subscribe to telemetry topic:', err);
      }
    });
  });

  mqttClient.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      const deviceId = topic.split('/')[2];
      io.emit('telemetry', { deviceId, data });

      // Forward to Pusher for production realtime updates (dashboard uses Pusher client)
      triggerTelemetryUpdate(deviceId, data).catch((err) => {
        console.error('Failed to forward telemetry to Pusher:', err);
      });
    } catch (err) {
      console.error('Failed to parse MQTT message:', err);
    }
  });

  io.on('connection', (socket) => {
    console.log('WebSocket client connected');

    socket.on('disconnect', () => {
      console.log('WebSocket client disconnected');
    });
  });

  server.listen(port, (err?: unknown) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);

    try {
      startCronJobs();
    } catch (cronError) {
      console.error('Failed to start cron jobs:', cronError);
    }
  });
});