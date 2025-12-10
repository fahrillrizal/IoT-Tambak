import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { startCronJobs } from './lib/cron-jobs';
import { triggerTelemetryUpdate } from './lib/pusher';
import { prisma } from './lib/db';
import axios from 'axios';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// ThingsBoard Configuration
const TB_URL = process.env.TB_URL || 'http://170.64.191.36:8088';
const TB_WS_URL = TB_URL.replace('http://', 'ws://').replace('https://', 'wss://');

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store WebSocket connections per device
const deviceSubscriptions = new Map<string, WebSocket>();
let tbToken: string | null = null;
let tokenExpiry = 0;

// Get ThingsBoard JWT token
async function getTBToken(): Promise<string> {
  if (tbToken && tokenExpiry > Date.now()) {
    return tbToken;
  }

  const response = await axios.post(`${TB_URL}/api/auth/login`, {
    username: process.env.TB_USERNAME,
    password: process.env.TB_PASSWORD,
  });

  tbToken = response.data.token;
  tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes
  return tbToken!;
}

// Subscribe to device telemetry via ThingsBoard WebSocket
async function subscribeToDeviceTelemetry(deviceId: string, io: Server) {
  if (deviceSubscriptions.has(deviceId)) {
    console.log(`WebSocket subscription already exists for device ${deviceId}`);
    return;
  }

  try {
    const token = await getTBToken();
    const wsUrl = `${TB_WS_URL}/api/ws/plugins/telemetry?token=${token}`;
    
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log(`✓ ThingsBoard WS connected for device: ${deviceId}`);
      
      // Subscribe to device telemetry
      const subscribeCmd = {
        tsSubCmds: [
          {
            entityType: 'DEVICE',
            entityId: deviceId,
            scope: 'LATEST_TELEMETRY',
            cmdId: 1,
          },
        ],
        historyCmds: [],
        attrSubCmds: [],
      };
      
      ws.send(JSON.stringify(subscribeCmd));
      console.log(`✓ Subscribed to telemetry for device: ${deviceId}`);
    });

    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        
        if (message.subscriptionId && message.data) {
          // Parse telemetry data
          const telemetryData: Record<string, number> = {};
          
          for (const [key, values] of Object.entries(message.data)) {
            if (Array.isArray(values) && values.length > 0) {
              const latest = values[values.length - 1] as [number, string];
              telemetryData[key] = parseFloat(latest[1]);
            }
          }

          if (Object.keys(telemetryData).length > 0) {
            console.log(`📡 Telemetry from device ${deviceId}:`, telemetryData);

            // Emit via Socket.IO for dev (WebSocket)
            io.to(`device:${deviceId}`).emit('telemetry', { 
              deviceId, 
              data: telemetryData, 
              timestamp: Date.now() 
            });
            
            // Also emit to global room for dashboard updates
            io.emit('telemetry:update', { 
              deviceId, 
              data: telemetryData, 
              timestamp: Date.now() 
            });

            // Forward to Pusher for production clients
            if (!dev) {
              triggerTelemetryUpdate(deviceId, telemetryData).catch((err) => {
                console.error('Failed to forward telemetry to Pusher:', err);
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse ThingsBoard WS message:', err);
      }
    });

    ws.on('error', (err) => {
      console.error(`ThingsBoard WS error for device ${deviceId}:`, err.message);
    });

    ws.on('close', (code, reason) => {
      console.log(`ThingsBoard WS closed for device ${deviceId}: ${code} - ${reason}`);
      deviceSubscriptions.delete(deviceId);
      
      // Reconnect after 5 seconds
      setTimeout(() => {
        console.log(`Reconnecting to device ${deviceId}...`);
        subscribeToDeviceTelemetry(deviceId, io);
      }, 5000);
    });

    deviceSubscriptions.set(deviceId, ws);
  } catch (error) {
    console.error(`Failed to subscribe to device ${deviceId}:`, error);
  }
}

// Initialize ThingsBoard WebSocket subscriptions for all devices
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

    console.log(`Found ${devices.length} active devices for telemetry subscription`);

    for (const device of devices) {
      if (device.thingsboardDeviceId) {
        await subscribeToDeviceTelemetry(device.thingsboardDeviceId, io);
      }
    }
  } catch (error) {
    console.error('Failed to initialize telemetry subscriptions:', error);
  }
}

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
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    console.log('✓ WebSocket client connected:', socket.id);

    // Client can join device-specific room
    socket.on('subscribe:device', (deviceId: string) => {
      socket.join(`device:${deviceId}`);
      console.log(`Client ${socket.id} subscribed to device: ${deviceId}`);
    });

    socket.on('unsubscribe:device', (deviceId: string) => {
      socket.leave(`device:${deviceId}`);
      console.log(`Client ${socket.id} unsubscribed from device: ${deviceId}`);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket client disconnected:', socket.id);
    });
  });

  server.listen(port, async (err?: unknown) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);

    // Initialize ThingsBoard WebSocket subscriptions for all devices
    await initializeTelemetrySubscriptions(io);

    try {
      startCronJobs();
    } catch (cronError) {
      console.error('Failed to start cron jobs:', cronError);
    }
  });
});