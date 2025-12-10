// lib/socket-client.ts (Client-side WebSocket for development)
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

// Interface untuk telemetry data (sama dengan pusher-client)
export interface TelemetryPayload {
  deviceId: string;
  temperature?: number;
  ph?: number;
  dissolvedOxygen?: number;
  salinity?: number;
  turbidity?: number;
  timestamp: number;
}

export function getSocketClient(): Socket {
  if (!socketInstance && typeof window !== 'undefined') {
    socketInstance = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('✓ Socket.IO connected:', socketInstance?.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
  }
  return socketInstance!;
}

// Subscribe to device telemetry via WebSocket (development)
export function subscribeToDeviceWebSocket(
  deviceId: string,
  callback: (data: TelemetryPayload) => void
) {
  const socket = getSocketClient();
  
  // Join device room
  socket.emit('subscribe:device', deviceId);
  
  // Listen for telemetry updates
  const handleTelemetry = (payload: { deviceId: string; data: any; timestamp: number }) => {
    if (payload.deviceId === deviceId) {
      console.log('📡 Socket.IO telemetry received:', payload);
      // Normalize data structure
      callback({
        deviceId: payload.deviceId,
        ...payload.data,
        timestamp: payload.timestamp,
      });
    }
  };
  
  socket.on('telemetry', handleTelemetry);
  socket.on('telemetry:update', handleTelemetry);

  // Return unsubscribe function
  return () => {
    socket.emit('unsubscribe:device', deviceId);
    socket.off('telemetry', handleTelemetry);
    socket.off('telemetry:update', handleTelemetry);
  };
}

// Subscribe to all telemetry updates
export function subscribeToGlobalWebSocket(callback: (data: TelemetryPayload) => void) {
  const socket = getSocketClient();
  
  const handleTelemetry = (payload: { deviceId: string; data: any; timestamp: number }) => {
    console.log('📡 Socket.IO global telemetry:', payload);
    callback({
      deviceId: payload.deviceId,
      ...payload.data,
      timestamp: payload.timestamp,
    });
  };
  
  socket.on('telemetry:update', handleTelemetry);

  return () => {
    socket.off('telemetry:update', handleTelemetry);
  };
}

// Interface untuk summary update event
export interface SummaryUpdatePayload {
  type: 'hourly' | 'daily' | 'weekly';
  timestamp: number;
}

// Subscribe to summary updates (for development)
export function subscribeToSummaryUpdates(callback: (data: SummaryUpdatePayload) => void) {
  const socket = getSocketClient();
  
  socket.on('summary:updated', (data: SummaryUpdatePayload) => {
    console.log('📊 Summary updated via Socket.IO:', data);
    callback(data);
  });

  return () => {
    socket.off('summary:updated');
  };
}

// Disconnect socket
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
